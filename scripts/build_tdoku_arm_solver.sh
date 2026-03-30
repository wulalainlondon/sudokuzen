#!/usr/bin/env bash
set -euo pipefail

TDOKU_ROOT="${TDOKU_ROOT:-/tmp/tdoku_data}"
TDOKU_SRC_DIR="${TDOKU_ROOT}/tdoku-master"
TDOKU_TAR="${TDOKU_ROOT}/tdoku.tar.gz"
TDOKU_URL="${TDOKU_URL:-https://github.com/t-dillon/tdoku/archive/refs/heads/master.tar.gz}"
OUT_BIN="${OUT_BIN:-/tmp/tdoku_data/tdoku_solve_arm}"

mkdir -p "${TDOKU_ROOT}"

if [[ ! -d "${TDOKU_SRC_DIR}" ]]; then
  echo "[build_tdoku_arm] Downloading tdoku source..."
  curl -L --max-time 120 -o "${TDOKU_TAR}" "${TDOKU_URL}"
  tar -xzf "${TDOKU_TAR}" -C "${TDOKU_ROOT}"
fi

cat > "${TDOKU_SRC_DIR}/example/tdoku_arm_shim.cc" <<'EOF'
#include <cstddef>
#include <cstdint>

extern "C" size_t TdokuSolverDpllTriadScc(const char *input, size_t limit, uint32_t configuration,
                                           char *solution, size_t *num_guesses);

extern "C" size_t TdokuSolverDpllTriadSimd(const char *input, size_t limit, uint32_t configuration,
                                           char *solution, size_t *num_guesses) {
  return TdokuSolverDpllTriadScc(input, limit, configuration, solution, num_guesses);
}

extern "C" size_t TdokuEnumerate(const char *, size_t, void (*)(const char *, void *), void *) {
  return 0;
}

extern "C" bool TdokuConstrain(bool, char *) { return false; }
extern "C" bool TdokuMinimize(bool, bool, char *) { return false; }
EOF

echo "[build_tdoku_arm] Compiling tdoku solve binary for arm64 (SCC backend)..."
g++ -O3 -std=c++17 \
  -I"${TDOKU_SRC_DIR}/include" \
  "${TDOKU_SRC_DIR}/example/solve.c" \
  "${TDOKU_SRC_DIR}/src/solver_dpll_triad_scc.cc" \
  "${TDOKU_SRC_DIR}/example/tdoku_arm_shim.cc" \
  -o "${OUT_BIN}" \
  -lm

echo "[build_tdoku_arm] Done: ${OUT_BIN}"
