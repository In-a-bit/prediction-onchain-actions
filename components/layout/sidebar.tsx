"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { contracts } from "@/lib/contracts/registry";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold">Contract Tester</h1>
        <p className="text-sm text-zinc-500">Polymarket Infrastructure</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
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
      </nav>
      <div className="border-t border-zinc-200 p-4 text-xs text-zinc-500 dark:border-zinc-800">
        Polygon Amoy Testnet
      </div>
    </aside>
  );
}
