// Windows desktop layer for the planner panel.
//
// The panel must stay above the desktop surface (Program Manager and the WorkerW
// hosts that draw the wallpaper and the desktop icons) and below every ordinary
// application window.
//
// Version 1.0.11 forced HWND_BOTTOM on every z-order change. HWND_BOTTOM is
// relative to the *whole* window stack, so as soon as a desktop host was raised
// above the panel (shell/wallpaper host recreation, "show desktop", explorer
// restart, display change) the panel ended up underneath the desktop surface.
// Every later show/restore/focus request was rewritten to HWND_BOTTOM again, so
// the tray could never bring the panel back.
//
// This version anchors the panel directly above the topmost desktop surface
// window instead. The placement is recomputed on every z-order request, so the
// panel stays above the desktop and below the user's working applications, and
// can always recover.
//
// N-API is resolved at load time from the host executable. Keeping the file free
// of link-time N-API imports lets the addon be rebuilt without the Electron
// headers or an MSVC installation.

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

// Minimal N-API surface. N-API is ABI stable, so these signatures are enough for
// the few calls this module makes. napi_ok is 0.
typedef struct napi_env__* napi_env;
typedef struct napi_value__* napi_value;
typedef struct napi_callback_info__* napi_callback_info;
typedef napi_value (*napi_callback)(napi_env, napi_callback_info);
typedef int (*napi_create_function_t)(napi_env, const char*, size_t, napi_callback, void*, napi_value*);
typedef int (*napi_set_named_property_t)(napi_env, napi_value, const char*, napi_value);
typedef int (*napi_get_boolean_t)(napi_env, bool, napi_value*);
typedef int (*napi_create_uint32_t)(napi_env, uint32_t, napi_value*);
typedef int (*napi_throw_error_t)(napi_env, const char*, const char*);
typedef int (*napi_get_cb_info_t)(napi_env, napi_callback_info, size_t*, napi_value*, napi_value*, void**);
typedef int (*napi_is_buffer_t)(napi_env, napi_value, bool*);
typedef int (*napi_get_buffer_info_t)(napi_env, napi_value, void**, size_t*);
typedef int (*napi_get_value_string_utf16_t)(napi_env, napi_value, char16_t*, size_t, size_t*);

static struct {
  napi_create_function_t create_function;
  napi_set_named_property_t set_named_property;
  napi_get_boolean_t get_boolean;
  napi_create_uint32_t create_uint32;
  napi_throw_error_t throw_error;
  napi_get_cb_info_t get_cb_info;
  napi_is_buffer_t is_buffer;
  napi_get_buffer_info_t get_buffer_info;
  napi_get_value_string_utf16_t get_value_string_utf16;
} napi;

template <typename T>
static bool Bind(HMODULE host, const char* name, T* target) {
  *target = reinterpret_cast<T>(reinterpret_cast<void*>(GetProcAddress(host, name)));
  return *target != nullptr;
}
static bool BindNapi() {
  static int bound = 0;
  if (bound) return bound > 0;
  HMODULE host = GetModuleHandleW(nullptr);
  bool ok = host &&
    Bind(host, "napi_create_function", &napi.create_function) &&
    Bind(host, "napi_set_named_property", &napi.set_named_property) &&
    Bind(host, "napi_get_boolean", &napi.get_boolean) &&
    Bind(host, "napi_create_uint32", &napi.create_uint32) &&
    Bind(host, "napi_throw_error", &napi.throw_error) &&
    Bind(host, "napi_get_cb_info", &napi.get_cb_info) &&
    Bind(host, "napi_is_buffer", &napi.is_buffer) &&
    Bind(host, "napi_get_buffer_info", &napi.get_buffer_info) &&
    Bind(host, "napi_get_value_string_utf16", &napi.get_value_string_utf16);
  bound = ok ? 1 : -1;
  return ok;
}

// Desktop surface detection ---------------------------------------------------

static BOOL CALLBACK FindDefView(HWND child, LPARAM lp) {
  wchar_t cls[64] = L"";
  if (GetClassNameW(child, cls, 64) && !lstrcmpiW(cls, L"SHELLDLL_DefView")) {
    *reinterpret_cast<HWND*>(lp) = child;
    return FALSE;
  }
  return TRUE;
}
// Progman and WorkerW own the wallpaper and the desktop icons. WorkerW is also
// created by wallpaper hosts, so every top-level WorkerW counts as desktop.
static bool IsDesktopSurface(HWND w) {
  wchar_t cls[64] = L"";
  if (!GetClassNameW(w, cls, 64)) return false;
  if (!lstrcmpiW(cls, L"Progman")) return true;
  if (lstrcmpiW(cls, L"WorkerW")) return false;
  HWND defView = nullptr;
  EnumChildWindows(w, FindDefView, reinterpret_cast<LPARAM>(&defView));
  return defView != nullptr || IsWindowVisible(w);
}
// Minimized, hidden and zero-sized windows never paint and can be skipped while
// searching for the top of the desktop band.
static bool Paints(HWND w) {
  if (!IsWindowVisible(w) || IsIconic(w)) return false;
  RECT rect{};
  if (!GetWindowRect(w, &rect)) return false;
  return rect.right > rect.left && rect.bottom > rect.top;
}
// Topmost window of the desktop surface band at the bottom of the z-order.
static HWND DesktopSurface(HWND self) {
  HWND top = GetTopWindow(nullptr);
  if (!top) return nullptr;
  // Bounded walk: a long run of minimized windows must not make every z-order
  // change expensive.
  int iterations = 96;
  HWND surface = nullptr;
  for (HWND w = GetWindow(top, GW_HWNDLAST); w && iterations-- > 0; w = GetWindow(w, GW_HWNDPREV)) {
    if (w == self) continue;
    if (IsDesktopSurface(w)) { surface = w; continue; }
    if (surface && Paints(w)) break;
  }
  return surface;
}

enum class Placement { AboveSurface, Bottom, Keep };
// Window to insert after (place below) so the panel lands directly above the
// desktop surface, below every ordinary application.
static Placement ComputePlacement(HWND self, HWND* insertAfter) {
  HWND surface = DesktopSurface(self);
  if (!surface) { *insertAfter = HWND_BOTTOM; return Placement::Bottom; }
  HWND above = GetWindow(surface, GW_HWNDPREV);
  if (!above || above == self) return Placement::Keep;
  *insertAfter = above;
  return Placement::AboveSurface;
}

// Never let the panel stay above the user's working application, and never let
// the desktop surface end up above the panel.
static LRESULT CALLBACK DesktopLayer(HWND hwnd, UINT message, WPARAM wp, LPARAM lp, UINT_PTR id, DWORD_PTR) {
  if (message == WM_WINDOWPOSCHANGING && lp) {
    auto* position = reinterpret_cast<WINDOWPOS*>(lp);
    // Minimized windows have no meaningful z position and are restored later.
    if (!IsIconic(hwnd)) {
      HWND insertAfter = nullptr;
      switch (ComputePlacement(hwnd, &insertAfter)) {
        case Placement::AboveSurface:
          position->hwndInsertAfter = insertAfter;
          position->flags &= ~SWP_NOZORDER;
          break;
        case Placement::Bottom:
          position->hwndInsertAfter = HWND_BOTTOM;
          position->flags &= ~SWP_NOZORDER;
          break;
        default:
          position->flags |= SWP_NOZORDER;
          break;
      }
    }
  }
  if (message == WM_NCDESTROY) RemoveWindowSubclass(hwnd, DesktopLayer, id);
  return DefSubclassProc(hwnd, message, wp, lp);
}
static void Settle(HWND hwnd) {
  HWND insertAfter = nullptr;
  Placement placement = ComputePlacement(hwnd, &insertAfter);
  if (placement == Placement::Keep) return;
  SetWindowPos(hwnd, placement == Placement::Bottom ? HWND_BOTTOM : insertAfter, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
}

// Arguments -------------------------------------------------------------------

static bool OwnHandle(napi_env env, napi_value value, HWND* hwnd, bool sameProcess = true) {
  bool buffer = false; void* data = nullptr; size_t length = 0;
  if (napi.is_buffer(env, value, &buffer) != 0 || !buffer ||
      napi.get_buffer_info(env, value, &data, &length) != 0 || length != sizeof(HWND)) return false;
  std::memcpy(hwnd, data, sizeof(HWND));
  if (!IsWindow(*hwnd)) return false;
  if (!sameProcess) return true;
  DWORD pid = 0; GetWindowThreadProcessId(*hwnd, &pid);
  return pid == GetCurrentProcessId();
}
static bool Arg(napi_env env, napi_callback_info info, size_t expected, napi_value* args) {
  size_t count = expected;
  return napi.get_cb_info(env, info, &count, args, nullptr, nullptr) == 0 && count == expected;
}
static napi_value Boolean(napi_env env, bool value) {
  napi_value result = nullptr; napi.get_boolean(env, value, &result); return result;
}
static bool Text(napi_env env, napi_value value, std::wstring* result) {
  size_t size = 0;
  if (napi.get_value_string_utf16(env, value, nullptr, 0, &size) != 0 || size > 24000) return false;
  std::vector<char16_t> text(size + 1);
  if (napi.get_value_string_utf16(env, value, text.data(), text.size(), &size) != 0) return false;
  result->assign(text.begin(), text.begin() + size);
  return true;
}

// Exports ---------------------------------------------------------------------

static napi_value Attach(napi_env env, napi_callback_info info) {
  napi_value args[1]; HWND hwnd = nullptr;
  if (!Arg(env, info, 1, args) || !OwnHandle(env, args[0], &hwnd)) {
    napi.throw_error(env, nullptr, "Expected this process's window handle"); return nullptr;
  }
  if (!SetWindowSubclass(hwnd, DesktopLayer, 1, 0)) {
    napi.throw_error(env, nullptr, "Could not attach desktop window layer"); return nullptr;
  }
  Settle(hwnd);
  return Boolean(env, true);
}
// Re-assert the desktop layer on demand (tray show, wake, display change).
static napi_value SettleExport(napi_env env, napi_callback_info info) {
  napi_value args[1]; HWND hwnd = nullptr;
  if (!Arg(env, info, 1, args) || !OwnHandle(env, args[0], &hwnd)) {
    napi.throw_error(env, nullptr, "Expected this process's window handle"); return nullptr;
  }
  Settle(hwnd);
  return Boolean(env, true);
}
static napi_value IsBelow(napi_env env, napi_callback_info info) {
  napi_value args[2]; HWND panel = nullptr, other = nullptr;
  if (!Arg(env, info, 2, args) || !OwnHandle(env, args[0], &panel)) {
    napi.throw_error(env, nullptr, "Expected this process's window handles"); return nullptr;
  }
  if (!OwnHandle(env, args[1], &other, false)) {
    napi.throw_error(env, nullptr, "Expected a live window handle"); return nullptr;
  }
  bool below = false;
  for (HWND w = GetWindow(panel, GW_HWNDPREV); w; w = GetWindow(w, GW_HWNDPREV)) if (w == other) { below = true; break; }
  return Boolean(env, below);
}
// True when the panel is not underneath the desktop surface.
static napi_value Anchored(napi_env env, napi_callback_info info) {
  napi_value args[1]; HWND hwnd = nullptr;
  if (!Arg(env, info, 1, args) || !OwnHandle(env, args[0], &hwnd)) {
    napi.throw_error(env, nullptr, "Expected this process's window handle"); return nullptr;
  }
  HWND surface = DesktopSurface(hwnd);
  if (!surface) return Boolean(env, true);
  for (HWND w = GetWindow(hwnd, GW_HWNDPREV); w; w = GetWindow(w, GW_HWNDPREV)) {
    if (w == surface) return Boolean(env, false);
  }
  return Boolean(env, true);
}
#ifndef NAPI_AUTO_LENGTH
#define NAPI_AUTO_LENGTH (static_cast<size_t>(-1))
#endif
static const wchar_t kSep = static_cast<wchar_t>(92);
static const wchar_t kQuote = static_cast<wchar_t>(34);

// A hidden, independent console lets Windows PowerShell continue after Electron exits.
// DETACHED_PROCESS is deliberately not used: Windows PowerShell can exit without executing in that mode.
static napi_value SpawnUpdater(napi_env env, napi_callback_info info) {
  std::fprintf(stderr, "Updater native: enter\n"); std::fflush(stderr);
  napi_value args[2]; std::wstring encoded, directory;
  if (!Arg(env, info, 2, args) || !Text(env, args[0], &encoded) || !Text(env, args[1], &directory) ||
      encoded.empty() || encoded.find_first_not_of(L"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=") != std::wstring::npos) {
    napi.throw_error(env, nullptr, "Invalid updater launch arguments"); return nullptr;
  }
  wchar_t system[MAX_PATH];
  if (!GetSystemDirectoryW(system, MAX_PATH)) { napi.throw_error(env, nullptr, "Windows system directory unavailable"); return nullptr; }
  const std::wstring separator(1, kSep), quote(1, kQuote);
  const std::wstring executable = std::wstring(system) + separator + L"WindowsPowerShell" + separator + L"v1.0" + separator + L"powershell.exe";
  const std::wstring command = quote + executable + quote + L" -NoProfile -NonInteractive -EncodedCommand " + encoded;
  std::vector<wchar_t> buffer(command.begin(), command.end()); buffer.push_back(0);
  STARTUPINFOW startup{}; startup.cb = sizeof(startup); startup.dwFlags = STARTF_USESHOWWINDOW; startup.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION process{};
  if (!CreateProcessW(executable.c_str(), buffer.data(), nullptr, nullptr, FALSE, CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP,
      nullptr, directory.c_str(), &startup, &process)) {
    napi.throw_error(env, nullptr, "Could not start Windows update helper"); return nullptr;
  }
  CloseHandle(process.hThread); CloseHandle(process.hProcess);
  napi_value result = nullptr; napi.create_uint32(env, process.dwProcessId, &result); return result;
}

static void Define(napi_env env, napi_value exports, const char* name, napi_callback callback) {
  napi_value fn = nullptr;
  if (napi.create_function(env, name, NAPI_AUTO_LENGTH, callback, nullptr, &fn) == 0 && fn)
    napi.set_named_property(env, exports, name, fn);
}
static napi_value Initialize(napi_env env, napi_value exports) {
  if (!BindNapi()) {
    return exports;
  }
  Define(env, exports, "attach", Attach);
  Define(env, exports, "settle", SettleExport);
  Define(env, exports, "isBelow", IsBelow);
  Define(env, exports, "anchored", Anchored);
  Define(env, exports, "spawnUpdater", SpawnUpdater);
  return exports;
}

// Legacy N-API registration: node_api.h's NAPI_MODULE registers the module from a
// load-time initializer. Keeping the struct layout explicit means the addon does
// not need the Electron headers to build.
struct NapiModule {
  int nm_version;
  unsigned int nm_flags;
  const char* nm_filename;
  napi_value (*nm_register_func)(napi_env, napi_value);
  const char* nm_modname;
  void* nm_priv;
  void* reserved[4];
};
static NapiModule kModule = { 1, 0, __FILE__, Initialize, "window_layer", nullptr, {nullptr, nullptr, nullptr, nullptr} };
static void RegisterModule() {
  HMODULE host = GetModuleHandleW(nullptr);
  if (!host) return;
  typedef void (*RegisterFn)(NapiModule*);
  RegisterFn register_module = reinterpret_cast<RegisterFn>(reinterpret_cast<void*>(GetProcAddress(host, "napi_module_register")));
  if (register_module) register_module(&kModule);
}
extern "C" BOOL WINAPI DllMain(HINSTANCE, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) RegisterModule();
  return TRUE;
}
