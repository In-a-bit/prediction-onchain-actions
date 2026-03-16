"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { contracts } from "@/lib/contracts/registry";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/auth";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">Contract Tester</h1>
        <p className="text-sm text-zinc-500">Polymarket Infrastructure</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Contracts
        </p>
        {Object.values(contracts).map((contract) => {
          const href = `/${contract.slug}`;
          const isActive = pathname === href;
          return (
            <Link
              key={contract.slug}
              href={href}
              className={cn(
                "mb-1 flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
              )}
            >
              <span
                className={cn(
                  "mr-2 h-2 w-2 rounded-full",
                  isActive ? "bg-green-400" : "bg-zinc-400"
                )}
              />
              {contract.name}
            </Link>
          );
        })}

        <div className="my-2 border-t border-zinc-200 dark:border-zinc-800" />
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Utils
        </p>
        {[
          { href: "/utils", label: "CREATE2 Calculator" },
          { href: "/create-market", label: "Create Market" },
          { href: "/send", label: "Send POL" },
          { href: "/register-relay", label: "Register Relay" },
          { href: "/admin", label: "Admin CRM" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "mb-1 flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            <span
              className={cn(
                "mr-2 h-2 w-2 rounded-full",
                pathname === href ? "bg-green-400" : "bg-zinc-400"
              )}
            />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">Polygon Amoy Testnet</span>
          <button
            onClick={async () => {
              await logout();
              router.push("/login");
              router.refresh();
            }}
            className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
