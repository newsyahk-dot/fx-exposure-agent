"use client";

// A Link that shows it was clicked. Every step and home currency is a server render (the book is live), so a
// click waits for one round trip; without feedback the page looks stuck for that moment, longer from far away.
// The marker below turns on while the navigation is pending: the clicked pill lights up at once and the page
// below the navigation dims (CSS in page.module.css, keyed on [data-pending]).

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import styles from "./page.module.css";

function Pending() {
  const { pending } = useLinkStatus();
  return <span className={styles.pendingMark} data-pending={pending || undefined} aria-hidden="true" />;
}

export function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <Pending />
    </Link>
  );
}
