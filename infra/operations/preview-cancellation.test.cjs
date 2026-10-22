const fs = require("node:fs");
const assert = require("node:assert/strict");
const { stripTypeScriptTypes } = require("node:module");
const app = fs.readFileSync(process.argv[2], "utf8");
const handler = app.slice(
  app.indexOf("  async function cancelSelectedAppointment()"),
  app.indexOf("  async function loadBookings()"),
);
assert.ok(handler.length > 300);
async function check(label, options = {}) {
  let calls = 0,
    selected = {
      id: "own",
      businessId: "private",
      status: "PENDING",
      startsAt: "2099-01-01T09:00:00Z",
      ...options.booking,
    };
  let rows = [selected, { id: "other", status: "CONFIRMED" }],
    notice = "",
    cleared = false;
  const api = {
    request: async (path, method, body) => {
      calls++;
      assert.equal(path, "/businesses/private/appointments/own/cancel");
      assert.equal(method, "POST");
      assert.ok(body.reason);
      if (options.reject) throw new Error("API rejected");
      return {
        ...selected,
        status: options.badResponse ? "PENDING" : "CANCELLED",
      };
    },
  };
  const fn = new Function(
    "api",
    "mode",
    "selected",
    "cancelTarget",
    "setSelected",
    "setBookings",
    "setCancelTarget",
    "setSlots",
    "setNotice",
    stripTypeScriptTypes(handler) + ";return cancelSelectedAppointment;",
  )(
    api,
    options.mode || "customer",
    selected,
    options.unconfirmed ? null : "own",
    (x) => (selected = x),
    (fn) => (rows = fn(rows)),
    () => {},
    () => (cleared = true),
    (x) => (notice = x),
  );
  if (options.reject || options.badResponse) await assert.rejects(fn());
  else await fn();
  if (options.blocked) {
    assert.equal(calls, 0);
    assert.equal(notice, "");
  } else if (options.reject || options.badResponse) {
    assert.equal(selected.status, "PENDING");
    assert.equal(notice, "");
    assert.equal(cleared, false);
  } else {
    assert.equal(calls, 1);
    assert.equal(selected.status, "CANCELLED");
    assert.equal(rows[0].status, "CANCELLED");
    assert.equal(rows[1].status, "CONFIRMED");
    assert.equal(cleared, true);
    assert.ok(notice.includes("iptal edildi"));
  }
  console.log(label + ": PASS");
}
(async () => {
  await check(
    "Confirmed customer cancellation updates detail/list and clears stale slots",
  );
  await check("Cancellation requires explicit confirmation", {
    unconfirmed: true,
    blocked: true,
  });
  await check("Business mode cannot call customer action", {
    mode: "business",
    blocked: true,
  });
  for (const status of ["IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"])
    await check("Cancellation blocked for " + status, {
      booking: { status },
      blocked: true,
    });
  await check("Past appointment cancellation blocked", {
    booking: { startsAt: "2000-01-01T09:00:00Z" },
    blocked: true,
  });
  await check("API rejection preserves detail and list", { reject: true });
  await check("Unexpected response cannot claim success", {
    badResponse: true,
  });
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
