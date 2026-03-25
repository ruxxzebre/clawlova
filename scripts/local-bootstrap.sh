#!/bin/sh

set -eu

CONFIG_ROOT="${OPENCLAW_CONFIG_ROOT:-/home/node/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-/home/node/.openclaw/workspace}"
DEVICE_FILE="${OPENCLAW_DEVICE_FILE:-/var/lib/cockpit/openclaw-device.json}"
DEVICE_TOKEN_FILE="${OPENCLAW_DEVICE_TOKEN_FILE:-/var/lib/cockpit/openclaw-device-token}"
BOOTSTRAP_TOKEN_FILE="${OPENCLAW_BOOTSTRAP_TOKEN_FILE:-${CONFIG_ROOT}/.gateway-token}"
WAIT_SECONDS="${OPENCLAW_BOOTSTRAP_WAIT_SECONDS:-90}"

log() {
  printf '%s\n' "$*"
}

run_device_connect() {
  if node /bootstrap/openclaw-device-connect.mjs >/tmp/cockpit-bootstrap-connect.log 2>&1; then
    return 0
  fi

  log "bootstrap: device connect probe failed"
  if [ -f /tmp/cockpit-bootstrap-connect.log ]; then
    cat /tmp/cockpit-bootstrap-connect.log
  fi
  return 1
}

ensure_config() {
  if [ -f "${CONFIG_ROOT}/openclaw.json" ]; then
    return 0
  fi

  if [ -f "${BOOTSTRAP_TOKEN_FILE}" ] && [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    OPENCLAW_GATEWAY_TOKEN="$(tr -d '\n' <"${BOOTSTRAP_TOKEN_FILE}")"
    export OPENCLAW_GATEWAY_TOKEN
  fi

  if [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    log "bootstrap: gateway bootstrap token is missing"
    exit 1
  fi

  mkdir -p "${CONFIG_ROOT}" "${WORKSPACE_DIR}"

  log "bootstrap: initializing OpenClaw config"
  node dist/index.js onboard \
    --non-interactive \
    --accept-risk \
    --mode local \
    --flow quickstart \
    --auth-choice skip \
    --skip-ui \
    --skip-search \
    --skip-skills \
    --skip-channels \
    --skip-daemon \
    --skip-health \
    --gateway-auth token \
    --gateway-token "${OPENCLAW_GATEWAY_TOKEN}" \
    --gateway-bind "${OPENCLAW_GATEWAY_BIND:-lan}" \
    --workspace "${WORKSPACE_DIR}"
}

wait_for_gateway() {
  deadline=$(( $(date +%s) + WAIT_SECONDS ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    if node -e "fetch('http://127.0.0.1:18789/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
      return 0
    fi
    sleep 2
  done

  log "bootstrap: gateway did not become healthy within ${WAIT_SECONDS}s"
  exit 1
}

ensure_cockpit_identity() {
  if [ -f "${DEVICE_FILE}" ]; then
    return 0
  fi

  mkdir -p "$(dirname "${DEVICE_FILE}")"
  node -e "const crypto=require('node:crypto'); const fs=require('node:fs'); const path=require('node:path'); const deviceFile=process.argv[1]; fs.mkdirSync(path.dirname(deviceFile), { recursive: true }); const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); const jwk = publicKey.export({ format: 'jwk' }); const publicKeyRaw = Buffer.from(jwk.x, 'base64url'); const identity = { id: crypto.createHash('sha256').update(publicKeyRaw).digest('hex'), publicKey: Buffer.from(publicKeyRaw).toString('base64url'), privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() }; fs.writeFileSync(deviceFile, JSON.stringify(identity, null, 2) + '\n', 'utf8');" "${DEVICE_FILE}"
}

pair_cockpit() {
  ensure_cockpit_identity

  if [ -f "${DEVICE_TOKEN_FILE}" ]; then
    log "bootstrap: cockpit device token already exists"
    return 0
  fi

  log "bootstrap: probing cockpit device pairing"
  run_device_connect || true

  if [ ! -f "${DEVICE_FILE}" ]; then
    log "bootstrap: cockpit device identity was not created"
    if [ -f /tmp/cockpit-bootstrap-connect.log ]; then
      cat /tmp/cockpit-bootstrap-connect.log
    fi
    exit 1
  fi

  if [ -f "${DEVICE_TOKEN_FILE}" ]; then
    log "bootstrap: cockpit device token persisted during initial connect"
    return 0
  fi

  # Fallback: if loopback auto-approve didn't work, use CLI to approve
  deadline=$(( $(date +%s) + WAIT_SECONDS ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    run_device_connect || true

    if [ -f "${DEVICE_TOKEN_FILE}" ]; then
      log "bootstrap: cockpit device paired successfully"
      return 0
    fi

    # Approve the latest pending device request via CLI
    node dist/index.js devices approve --latest 2>/dev/null || true
    sleep 2
  done

  log "bootstrap: failed to pair cockpit device"
  if [ -f /tmp/cockpit-bootstrap-connect.log ]; then
    cat /tmp/cockpit-bootstrap-connect.log
  fi
  exit 1
}

ensure_config
wait_for_gateway
pair_cockpit
