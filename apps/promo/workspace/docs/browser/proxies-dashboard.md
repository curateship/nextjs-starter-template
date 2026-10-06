# The Proxies dashboard

Every proxy the browser profiles can go out through, in one table at
`/admin/proxies`, reached from **Proxies** in the left menu. A proxy is bought
in a list and dies without warning, so this is where a dead one shows at a
glance. Tyler, 5 Oct 2026: "Proxies and profiles needs its own dashboard."

The behaviour is copied from anti-detect's proxies dashboard, rebuilt from the
shell's own table and windows. The code is `src/components/browser/` for the
screen, `src/lib/api/browser/proxies.ts` for the endpoints and
`src/server/browser/proxies.ts` for the records.

## The table

- **Proxy.** Its name, its kind (residential, mobile or datacenter), its
  protocol and its country. Clicking it opens the proxy as a window over the
  list, with `?open=<id>` in the address.
- **Endpoint.** Host and port.
- **Test.** The last test as a badge: country and speed when it worked, "Failed"
  with the reason when it did not, "Untested" when nobody has tested it.
- **Used by.** The browser profiles pointing at it. Anti-detect has no such
  column.
- **Outside address.** What the record of its outside address says: "Same
  address for 12 days", or "Address changed 14 times today". This is how a
  rotating proxy sold as a fixed one gets spotted.
- **Actions.** Test, settings, delete.

The toolbar has, in order: Delete when rows are ticked, the search, **Paste in**,
and **Add proxy**.

## Adding, editing and deleting

- **The password never comes back out.** The window's password box starts empty
  on an edit. Leaving it empty keeps the stored one; typing replaces it.
- **A host inside the network is refused** on save, on paste and on test. Promo
  had this and anti-detect does not, so it was kept: without it a proxy row is
  a way to make the server fetch its own neighbours.
- **Deleting says who loses it.** The question names the profiles using the
  proxy. They are kept and go out from this computer's own address until they
  are given another. An open browser keeps the old proxy until it is closed.

## Pasting in a list

One proxy per line, as `host:port`, `host:port:user:password`, or an address
such as `socks5://user:password@host:port`. A colon inside the password
survives. They arrive as residential and http unless the address says
otherwise, named after their host.

Unlike anti-detect's paste, one bad line does not throw the rest away. The good
lines are saved, each bad line is listed with its line number and what was
wrong ("Line 4: points inside the network"), and the box is left holding only
the bad lines, so fixing them and pressing **Add them** again is the whole
repair. At most 500 lines at a time.

## Keeping them honest

- **The regular re-test reaches every proxy.** Each pass of the shell's ticker
  tests the three that have waited longest, never-tested ones first, side by
  side, and leaves any proxy tested in the last ten minutes alone. Three dead
  proxies hold the shared ticker for one 12-second wait, not three. Ten new proxies are all tested
  within four passes, about a minute.
- **A test gives up after 12 seconds, whatever it is waiting on.** Node's own
  timeout only counts silence on a connection that already exists, so a proxy
  that dropped the connection attempt kept a test hanging past a minute, and
  the ticker with it. Measured on 5 Oct 2026 against 8.8.4.4:8080.
- **A dead proxy rings the bell once.** The notice goes out only when a proxy goes
  from working, or never tested, to failing, so one that stays dead does not
  ring every ten minutes. Copied from anti-detect's `proxyBecameDead`. The
  notice's id is the proxy's id, so clicking it opens that proxy here, and a
  proxy that dies again after recovering brings the same notice back to the
  top as unread rather than adding a second one.
- **The outside address is kept, one row per change.** A test that sees the same
  address as last time adds nothing. Each proxy keeps its newest 200 rows.

## Changing a profile's proxy

A profile picks its proxy in its own window on the Browser profiles dashboard.
Two things are said before saving:

- **An open browser keeps the old proxy.** The row says "On its old proxy" and the
  window offers **Restart it now**, which queues a close and then an open.
- **A change of country is warned about, not refused.** The cookies carry over,
  and the same signed-in account arriving from Germany an hour after it was in
  Texas is the kind of jump a site notices.
