#!/usr/bin/env bash
# Make rembg.service loadable and enabled on the Oracle VM.
#
# `systemctl mask` replaces /etc/systemd/system/rembg.service with a symlink
# to /dev/null. Unmask then leaves no unit file for a custom-only unit, so
# we restore the copy shipped at UNIT_SRC when systemd still cannot load it.
set -euo pipefail

UNIT="${UNIT:-rembg.service}"
UNIT_SRC="${UNIT_SRC:-/opt/rembg/current/deploy/rembg.service}"
UNIT_DST="${UNIT_DST:-/etc/systemd/system/rembg.service}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
SUDO="${SUDO:-sudo}"
INSTALL="${INSTALL:-install}"

systemctl_cmd() {
  "$SYSTEMCTL" "$@"
}

sudo_systemctl() {
  "$SUDO" "$SYSTEMCTL" "$@"
}

dump_unit_state() {
  echo "=== ${UNIT} state ==="
  systemctl_cmd show "$UNIT" -p LoadState -p UnitFileState -p FragmentPath -p ActiveState -p SubState --no-pager || true
  ls -l "$UNIT_DST" /lib/systemd/system/rembg.service /usr/lib/systemd/system/rembg.service 2>/dev/null || true
}

unit_prop() {
  local key="$1"
  systemctl_cmd show -p "$key" --value "$UNIT" 2>/dev/null || true
}

unit_is_masked() {
  local load_state unit_file_state
  load_state="$(unit_prop LoadState)"
  unit_file_state="$(unit_prop UnitFileState)"
  [[ "$load_state" == "masked" || "$unit_file_state" == "masked" ]]
}

unit_is_loadable() {
  systemctl_cmd cat "$UNIT" >/dev/null 2>&1
}

install_shipped_unit() {
  local tmp run_user run_group
  if [[ ! -f "$UNIT_SRC" ]]; then
    echo "missing shipped unit ${UNIT_SRC} and ${UNIT} is not loadable"
    dump_unit_state
    return 1
  fi
  run_user="$(id -un)"
  run_group="$(id -gn)"
  echo "installing ${UNIT} from ${UNIT_SRC} as ${run_user}:${run_group}"
  tmp="$(mktemp)"
  sed -e "s/^User=ubuntu$/User=${run_user}/" -e "s/^Group=ubuntu$/Group=${run_group}/" \
    "$UNIT_SRC" >"$tmp"
  "$SUDO" "$INSTALL" -m 644 "$tmp" "$UNIT_DST"
  rm -f "$tmp"
  sudo_systemctl daemon-reload
}

ensure_rembg_unit() {
  dump_unit_state

  if unit_is_masked; then
    echo "unmasking ${UNIT} (LoadState=$(unit_prop LoadState) UnitFileState=$(unit_prop UnitFileState))"
    if ! sudo_systemctl unmask "$UNIT"; then
      echo "sudo systemctl unmask ${UNIT} failed. On the VM: sudo systemctl unmask rembg.service"
      dump_unit_state
      return 1
    fi
  fi

  if ! unit_is_loadable; then
    install_shipped_unit
  fi

  if ! unit_is_loadable; then
    echo "${UNIT} is still not loadable after restore"
    dump_unit_state
    return 1
  fi

  sudo_systemctl enable "$UNIT"
}

self_test() {
  local tmp fake_bin state src dst
  tmp="$(mktemp -d)"
  fake_bin="${tmp}/bin"
  state="${tmp}/state"
  src="${tmp}/shipped.service"
  dst="${tmp}/etc-rembg.service"
  mkdir -p "$fake_bin"
  printf '[Service]\nUser=ubuntu\nGroup=ubuntu\nExecStart=/bin/true\n' >"$src"
  touch "$dst"

  cat >"${fake_bin}/systemctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE_DIR="${FAKE_SYSTEMCTL_STATE:?}"
cmd="$1"
shift || true
read_state() { cat "${STATE_DIR}/$1" 2>/dev/null || true; }
write_state() { printf '%s\n' "$2" >"${STATE_DIR}/$1"; }

case "$cmd" in
  show)
    key=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -p) key="$2"; shift 2 ;;
        --value|--no-pager) shift ;;
        *) shift ;;
      esac
    done
    case "$key" in
      LoadState) read_state load ;;
      UnitFileState) read_state file ;;
      FragmentPath) read_state fragment ;;
      ActiveState) read_state active ;;
      SubState) read_state sub ;;
    esac
    ;;
  cat)
    if [[ "$(read_state load)" == "masked" || "$(read_state loadable)" == "no" ]]; then
      exit 1
    fi
    exit 0
    ;;
  unmask)
    write_state load "$(read_state after_unmask_load)"
    write_state file "$(read_state after_unmask_file)"
    write_state loadable "$(read_state after_unmask_loadable)"
    echo "unmasked"
    ;;
  daemon-reload)
    write_state load "loaded"
    write_state file "disabled"
    write_state loadable "yes"
    echo "reloaded"
    ;;
  enable)
    write_state file "enabled"
    echo "enabled"
    ;;
  *)
    echo "unexpected systemctl $cmd $*" >&2
    exit 2
    ;;
esac
EOF
  chmod +x "${fake_bin}/systemctl"

  cat >"${fake_bin}/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec "$@"
EOF
  chmod +x "${fake_bin}/sudo"

  cat >"${fake_bin}/install" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
while [[ $# -gt 0 && "$1" == -* ]]; do shift 2 || true; done
cp "$1" "$2"
echo "installed $1 -> $2"
EOF
  chmod +x "${fake_bin}/install"

  reset_state() {
    mkdir -p "$state"
    rm -f "${state:?}/"*
  }

  export FAKE_SYSTEMCTL_STATE="$state"
  SYSTEMCTL="${fake_bin}/systemctl"
  SUDO="${fake_bin}/sudo"
  INSTALL="${fake_bin}/install"
  UNIT_SRC="$src"
  UNIT_DST="$dst"
  UNIT="rembg.service"

  # Masked custom unit: unmask leaves nothing to load → install shipped file.
  reset_state
  printf 'masked\n' >"${state}/load"
  printf 'masked\n' >"${state}/file"
  printf 'no\n' >"${state}/loadable"
  printf 'not-found\n' >"${state}/after_unmask_load"
  printf 'disabled\n' >"${state}/after_unmask_file"
  printf 'no\n' >"${state}/after_unmask_loadable"
  ensure_rembg_unit
  test "$(cat "${state}/file")" = "enabled"
  grep -q 'ExecStart=/bin/true' "$dst"
  echo "ok masked-missing-restores"

  # Masked overlay: unmask reveals the real unit → do not overwrite.
  reset_state
  printf 'ORIGINAL\n' >"$dst"
  printf 'masked\n' >"${state}/load"
  printf 'masked\n' >"${state}/file"
  printf 'no\n' >"${state}/loadable"
  printf 'loaded\n' >"${state}/after_unmask_load"
  printf 'disabled\n' >"${state}/after_unmask_file"
  printf 'yes\n' >"${state}/after_unmask_loadable"
  ensure_rembg_unit
  test "$(cat "$dst")" = "ORIGINAL"
  test "$(cat "${state}/file")" = "enabled"
  echo "ok masked-existing-keeps-unit"

  # Healthy unit: no unmask/install, still enable.
  reset_state
  printf 'ORIGINAL\n' >"$dst"
  printf 'loaded\n' >"${state}/load"
  printf 'enabled\n' >"${state}/file"
  printf 'yes\n' >"${state}/loadable"
  ensure_rembg_unit
  test "$(cat "$dst")" = "ORIGINAL"
  echo "ok already-loadable"

  rm -rf "$tmp"
  echo "ensure-rembg-unit self-test passed"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [[ "${1:-}" == "--self-test" ]]; then
    self_test
    exit 0
  fi
  ensure_rembg_unit
fi
