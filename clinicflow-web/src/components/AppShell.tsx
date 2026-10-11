import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";

import logo from "../assets/logo-new.svg";

/*
 * =========================================================
 * APP SHELL
 * =========================================================
 *
 * Page frame shared by the staff, doctor and patient
 * portals:
 * - large screens: the sidebar sits beside the page;
 * - phones and tablets: the sidebar is hidden and slides
 *   in from the left when the menu button is tapped, so
 *   the page gets the full width.
 *
 * The sidebar is rendered once and only moved with CSS,
 * so its effects (e.g. sign-out listeners) run once.
 */

const MobileMenuContext = createContext<() => void>(
  () => undefined,
);

/*
 * Headers call this from their menu button.
 */
export function useOpenMobileMenu() {
  return useContext(MobileMenuContext);
}

export function MobileMenuButton({
  dark = false,
}: {
  dark?: boolean;
}) {
  const openMenu = useOpenMobileMenu();

  return (
    <button
      type="button"
      onClick={openMenu}
      aria-label="Open menu"
      className={`-ml-1 mr-3 inline-flex rounded-lg p-2 transition lg:hidden ${
        dark
          ? "text-slate-200 hover:bg-slate-800"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Menu size={22} />
    </button>
  );
}

type AppShellProps = {
  sidebar: ReactNode;
  // Page header. Without one, phones get a small bar with
  // the menu button and logo.
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

function AppShell({
  sidebar,
  header,
  footer,
  children,
}: AppShellProps) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the menu after navigating.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Escape closes the menu; the page behind does not
  // scroll while it is open.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <MobileMenuContext.Provider value={() => setMenuOpen(true)}>
      <div className="flex min-h-screen bg-slate-50">
        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 shrink-0 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebar}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {header ?? (
            <div className="flex h-14 items-center border-b border-slate-200 bg-white px-4 lg:hidden">
              <MobileMenuButton />
              <img
                src={logo}
                alt="ClinicFlow"
                className="h-7 w-auto"
              />
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
              {children}
            </main>

            {footer}
          </div>
        </div>
      </div>
    </MobileMenuContext.Provider>
  );
}

export default AppShell;
