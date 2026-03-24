#!/usr/bin/env bash
# score-agent.sh
# Termux-friendly sync agent for SCORE STORE
# - Watch files
# - Run build checks
# - Push Supabase migrations
# - Commit + push to GitHub
# - Deploy to Vercel
#
# Usage:
#   ./score-agent.sh watch
#   ./score-agent.sh once
#
# Optional:
#   DRY_RUN=1 ./score-agent.sh once

set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/scorestore}"
BRANCH="${BRANCH:-main}"
WATCH_PATH="${WATCH_PATH:-$PROJECT_DIR}"
DEBOUNCE_SECONDS="${DEBOUNCE_SECONDS:-2}"
AUTO_BUILD="${AUTO_BUILD:-1}"
AUTO_SUPABASE_PUSH="${AUTO_SUPABASE_PUSH:-1}"
AUTO_GIT_PUSH="${AUTO_GIT_PUSH:-1}"
AUTO_VERCEL_DEPLOY="${AUTO_VERCEL_DEPLOY:-1}"
ALLOW_DEPLOY_WITHOUT_GIT="${ALLOW_DEPLOY_WITHOUT_GIT:-1}"
DRY_RUN="${DRY_RUN:-0}"
COMMIT_PREFIX="${COMMIT_PREFIX:-auto-sync}"
VERCEL_TOKEN="${VERCEL_TOKEN:-}"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

step() {
  local label="$1"
  shift
  log "$label"
  if [[ "$DRY_RUN" == "1" ]]; then
    log "[dry-run] $*"
    return 0
  fi
  "$@"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Falta la dependencia: $1"
}

npm_script_exists() {
  local script_name="$1"
  [[ -f package.json ]] || return 1
  node -e "const p=require('./package.json'); process.exit(!!(p.scripts && Object.prototype.hasOwnProperty.call(p.scripts, process.argv[1])) ? 0 : 1)" "$script_name" >/dev/null 2>&1
}

changed_files() {
  git ls-files -m -o -d --exclude-standard
}

has_matching_change() {
  local regex="$1"
  local file
  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    if [[ "$file" =~ $regex ]]; then
      return 0
    fi
  done < <(changed_files)
  return 1
}

has_any_change() {
  [[ -n "$(changed_files)" ]]
}

publish_relevant_changes() {
  has_matching_change '(^|/)(index\.html|legal\.html|success\.html|cancel\.html|css/|js/|api/|data/|assets/|site\.webmanifest|robots\.txt|sitemap\.xml|vercel\.json|package\.json|package-lock\.json|supabase/)'
}

migration_changes() {
  has_matching_change '(^|/)supabase/migrations/|(^|/).*\.sql$'
}

deps_changed() {
  has_matching_change '(^|/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$'
}

warn_netlify_traces() {
  if git grep -n -i "netlify" -- ':!package-lock.json' ':!node_modules' ':!.git' >/dev/null 2>&1; then
    log "⚠️  Se detectaron referencias a Netlify en el repositorio."
    git grep -n -i "netlify" -- ':!package-lock.json' ':!node_modules' ':!.git' || true
  fi
}

ensure_project() {
  [[ -d "$PROJECT_DIR" ]] || die "No existe el directorio del proyecto: $PROJECT_DIR"
  cd "$PROJECT_DIR"
}

check_prereqs() {
  need_cmd git
  need_cmd bash
  need_cmd grep
  need_cmd awk
  need_cmd sed
  need_cmd inotifywait
  need_cmd node
  need_cmd npm
  need_cmd vercel
  need_cmd supabase
}

load_local_env() {
  local env_file="$PROJECT_DIR/.env.agent"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi

  if [[ -n "$SUPABASE_ACCESS_TOKEN" ]]; then
    export SUPABASE_ACCESS_TOKEN
  fi
}

maybe_install_deps() {
  if [[ "$AUTO_BUILD" != "1" ]]; then
    return 0
  fi

  if deps_changed || [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      step "Instalando dependencias con npm ci..." npm ci
    else
      step "Instalando dependencias con npm install..." npm install
    fi
  fi
}

run_build_checks() {
  if [[ "$AUTO_BUILD" != "1" ]]; then
    return 0
  fi

  if npm_script_exists lint; then
    step "Ejecutando lint..." npm run -s lint
  fi

  if npm_script_exists build; then
    step "Ejecutando build..." npm run -s build
  fi
}

run_supabase_push() {
  if [[ "$AUTO_SUPABASE_PUSH" != "1" ]]; then
    return 0
  fi

  if ! migration_changes; then
    return 0
  fi

  log "🧬 Cambios de migración detectados."
  log "Supabase db push requiere el proyecto ligado con supabase link."
  step "Aplicando migraciones a Supabase..." supabase db push --yes
}

make_commit() {
  if ! has_any_change; then
    log "No hay cambios reales para commitear."
    return 0
  fi

  step "Preparando commit..." git add -A

  if git diff --cached --quiet; then
    log "Nada quedó stageado después del add."
    return 0
  fi

  local msg
  msg="$COMMIT_PREFIX $(date '+%Y-%m-%d %H:%M:%S')"

  step "Creando commit..." git commit -m "$msg"
}

push_github() {
  if [[ "$AUTO_GIT_PUSH" != "1" ]]; then
    return 0
  fi

  step "Subiendo a GitHub..." git push origin "$BRANCH"
}

deploy_vercel() {
  if [[ "$AUTO_VERCEL_DEPLOY" != "1" ]]; then
    return 0
  fi

  if ! publish_relevant_changes; then
    log "No hay cambios públicos relevantes; se omite deploy a Vercel."
    return 0
  fi

  local args=(--prod --yes)
  if [[ -n "$VERCEL_TOKEN" ]]; then
    args+=(--token "$VERCEL_TOKEN")
  fi

  step "Desplegando en Vercel..." vercel "${args[@]}"
}

process_cycle() {
  ensure_project
  load_local_env
  warn_netlify_traces

  if ! has_any_change; then
    log "Sin cambios detectados."
    return 0
  fi

  run_supabase_push
  maybe_install_deps
  run_build_checks
  make_commit

  if ! push_github; then
    log "⚠️  Falló el push a GitHub."
    if [[ "$ALLOW_DEPLOY_WITHOUT_GIT" != "1" ]]; then
      return 1
    fi
  fi

  deploy_vercel

  log "✅ Ciclo completado."
}

watch_loop() {
  ensure_project
  load_local_env
  check_prereqs

  log "🤖 Agente activo en: $PROJECT_DIR"
  log "Rama: $BRANCH"
  log "Modo: watch"

  while true; do
    inotifywait -r \
      -e modify,create,delete,move \
      --exclude '(^|/)(\.git|node_modules|dist|build|\.vercel|\.supabase)(/|$)' \
      "$WATCH_PATH" >/dev/null 2>&1 || true

    sleep "$DEBOUNCE_SECONDS"

    if ! process_cycle; then
      log "⚠️  El ciclo terminó con error, sigo escuchando cambios..."
    fi
  done
}

once_mode() {
  ensure_project
  load_local_env
  check_prereqs
  log "Modo: once"
  process_cycle
}

main() {
  local mode="${1:-watch}"

  case "$mode" in
    watch)
      watch_loop
      ;;
    once)
      once_mode
      ;;
    *)
      cat <<EOF
Uso:
  $0 watch
  $0 once

Variables útiles:
  PROJECT_DIR=$HOME/scorestore
  BRANCH=main
  AUTO_BUILD=1
  AUTO_SUPABASE_PUSH=1
  AUTO_GIT_PUSH=1
  AUTO_VERCEL_DEPLOY=1
  VERCEL_TOKEN=...
  SUPABASE_ACCESS_TOKEN=...
  DRY_RUN=1
EOF
      ;;
  esac
}

trap 'log "Interrumpido por el usuario."; exit 0' INT TERM
main "$@"
