import React, { useEffect, useMemo, useState } from "react";
import { db, configured } from "./lib/db";
import {
  Wine, ClipboardList, Tags, IndianRupee, ChartNoAxesColumn, History,
  PieChart, Printer, LogOut, Plus, Save, Search, ShieldCheck,
  CalendarDays, RefreshCw, Pencil, Trash2
} from "lucide-react";

const CATS = ["Brandy", "Whisky", "Rum", "Vodka", "Gin", "Beer", "Breezer", "Wine"];

const VOLS = [
  ["1_litre", "1 Litre", 1000],
  ["full", "Full", 750],
  ["half", "Half", 375],
  ["quarter", "Quarter", 180],
  ["90ml", "90 ml", 90],
  ["60ml", "60 ml", 60]
];

const DEFAULT_VOLS = ["full", "half", "quarter"];
const today = () => new Date().toLocaleDateString("en-CA");
const cash = n => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function App() {
  const [session, S] = useState(null);
  const [profile, P] = useState(null);
  const [page, G] = useState("stock");
  const [cat, C] = useState("Brandy");
  const [brands, B] = useState([]);
  const [brandVolumes, BV] = useState({});
  const [prices, R] = useState({});
  const [date, D] = useState(today());
  const [lines, L] = useState({});
  const [msg, M] = useState("");
  const [busy, Q] = useState(false);
  const [search, H] = useState("");
  const [email, E] = useState("");
  const [pass, W] = useState("");
  const [editBrand, EB] = useState(null);
  const [editPrice, EP] = useState(null);
  const [reports, RP] = useState([]);

  useEffect(() => {
    if (!db) return;
    db.auth.getSession().then(({ data }) => S(data.session));
    const { data: { subscription } } = db.auth.onAuthStateChange((_, s) => S(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      db.from("profiles").select("*").eq("id", session.user.id).single()
        .then(({ data, error }) => {
          P(data || null);
          if (error) M("No admin profile found. Ask the owner to grant admin access.");
        });
    } else {
      P(null);
    }
  }, [session]);

  useEffect(() => {
    if (profile?.role === "admin") loadMaster();
  }, [profile]);

  useEffect(() => {
    if (profile?.role === "admin" && page === "stock") loadDay();
    if (profile?.role === "admin" && page === "reports") loadReports();
  }, [profile, page, date, cat, brands.length]);

  async function loadMaster() {
    Q(true);
    const [
      { data: b, error: brandError },
      { data: p, error: priceError },
      { data: bv, error: volumeError }
    ] = await Promise.all([
      db.from("brands").select("*").order("category").order("name"),
      db.from("brand_prices").select("*"),
      db.from("brand_volumes").select("*")
    ]);

    if (brandError || priceError || volumeError) {
      M(brandError?.message || priceError?.message || volumeError?.message);
      Q(false);
      return;
    }

    B(b || []);

    const priceMap = {};
    (p || []).forEach(x => {
      priceMap[x.brand_id] = {
        ...(priceMap[x.brand_id] || {}),
        [x.volume_key]: Number(x.rate)
      };
    });
    R(priceMap);

    const volumeMap = {};
    (bv || []).forEach(x => {
      volumeMap[x.brand_id] = [...(volumeMap[x.brand_id] || []), x.volume_key];
    });
    BV(volumeMap);
    Q(false);
  }

  async function loadDay() {
    Q(true);
    const { data: entry, error } = await db.from("daily_entries")
      .select("id").eq("entry_date", date).maybeSingle();

    if (error) {
      M(error.message);
      Q(false);
      return;
    }

    const m = {};
    if (entry) {
      const { data, error: lineError } = await db.from("daily_entry_lines")
        .select("*").eq("entry_id", entry.id);
      if (lineError) {
        M(lineError.message);
        Q(false);
        return;
      }
      (data || []).forEach(x => {
        m[x.brand_id + "_" + x.volume_key] = {
          ob: x.opening_balance, rec: x.received, cb: x.closing_balance
        };
      });
    } else {
      const { data: prev } = await db.from("daily_entries")
        .select("id").lt("entry_date", date)
        .order("entry_date", { ascending: false }).limit(1).maybeSingle();

      if (prev) {
        const { data } = await db.from("daily_entry_lines")
          .select("brand_id,volume_key,closing_balance").eq("entry_id", prev.id);
        (data || []).forEach(x => {
          m[x.brand_id + "_" + x.volume_key] = {
            ob: x.closing_balance, rec: 0, cb: 0
          };
        });
      }
    }
    L(m);
    Q(false);
  }

  const list = useMemo(
    () => brands.filter(x =>
      x.active &&
      x.category === cat &&
      x.name.toLowerCase().includes(search.toLowerCase())
    ),
    [brands, cat, search]
  );

  function volumesFor(brandId) {
    const selected = brandVolumes[brandId];
    return VOLS.filter(v => (selected || DEFAULT_VOLS).includes(v[0]));
  }

  function calc(b, v) {
    const key = b.id + "_" + v[0];
    const x = { ob: 0, rec: 0, cb: 0, ...lines[key] };
    const total = Number(x.ob) + Number(x.rec);
    const cb = Math.min(Number(x.cb), total);
    const sold = total - cb;
    const rate = Number(prices[b.id]?.[v[0]] || 0);
    return { key, x, total, cb, sold, rate, amount: sold * rate };
  }

function downloadDailyPdf() {
  const rows = brands
    .filter(brand => brand.active)
    .flatMap(brand =>
      volumesFor(brand.id).map(volume => {
        const result = calc(brand, volume);

        return `
          <tr>
            <td>${brand.name}</td>
            <td>${brand.category}</td>
            <td>${volume[1]} (${volume[2]} ml)</td>
            <td>${result.x.ob}</td>
            <td>${result.x.rec}</td>
            <td>${result.total}</td>
            <td>${result.cb}</td>
            <td>${result.sold}</td>
            <td>₹${result.rate}</td>
            <td>₹${result.amount}</td>
          </tr>
        `;
      })
    ).join("");

  const totalSold = brands
    .filter(b => b.active)
    .reduce((sum, b) =>
      sum + volumesFor(b.id).reduce(
        (s, v) => s + calc(b, v).sold, 0
      ), 0
    );

  const totalAmount = brands
    .filter(b => b.active)
    .reduce((sum, b) =>
      sum + volumesFor(b.id).reduce(
        (s, v) => s + calc(b, v).amount, 0
      ), 0
    );

  const win = window.open("", "_blank");

  if (!win) {
    alert("Please allow pop-ups and try again.");
    return;
  }

  win.document.write(`
    <html>
    <head>
      <title>Daily Stock Register</title>
      <style>
        body { font-family: Arial; padding: 20px; }
        h1, h2, p { text-align: center; }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        th, td {
          border: 1px solid black;
          padding: 7px;
          text-align: center;
        }
        th { background: #eee; }
        .totals { margin-top: 20px; font-weight: bold; }
        @page { size: A4 landscape; margin: 10mm; }
      </style>
    </head>
    <body>
      <h1>GARDEN COURT BAR & RESTAURANT</h1>
      <h2>DAILY STOCK REGISTER</h2>
      <p>Date: ${date}</p>

      <table>
        <thead>
          <tr>
            <th>Brand</th>
            <th>Category</th>
            <th>Volume</th>
            <th>Opening</th>
            <th>Received</th>
            <th>Total</th>
            <th>Closing</th>
            <th>Sales</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="totals">
        Total Bottles Sold: ${totalSold}<br/><br/>
        Total Sales Amount: ₹${totalAmount.toLocaleString("en-IN")}
      </div>
    </body>
    </html>
  `);

  win.document.close();
  win.onload = () => {
    win.print();
  };
}


  function change(key, f, val) {
    L(old => ({
      ...old,
      [key]: {
        ob: 0, rec: 0, cb: 0, ...old[key],
        [f]: Math.max(0, Number(val) || 0)
      }
    }));
  }

  async function saveDay() {
    Q(true);
    const { data: e, error } = await db.from("daily_entries")
      .upsert({ entry_date: date, created_by: session.user.id }, { onConflict: "entry_date" })
      .select("id").single();

    if (error) {
      M(error.message);
      Q(false);
      return;
    }

    // Upsert only currently selected sizes. Older lines for sizes that are
    // no longer selected remain in the database as historical records.
    const rows = list.flatMap(b => volumesFor(b.id).map(v => {
      const x = calc(b, v);
      return {
        entry_id: e.id,
        brand_id: b.id,
        volume_key: v[0],
        opening_balance: x.x.ob,
        received: x.x.rec,
        closing_balance: x.cb,
        rate: x.rate
      };
    }));

    if (rows.length) {
      const { error: saveError } = await db.from("daily_entry_lines")
        .upsert(rows, { onConflict: "entry_id,brand_id,volume_key" });
      if (saveError) {
        M(saveError.message);
        Q(false);
        return;
      }
    }

    M("Daily entry saved. Existing records for other sizes were preserved.");
    Q(false);
  }

  async function saveBrand(form) {
    const selectedVolumes = form.selectedVolumes || DEFAULT_VOLS;
    const brandData = {
      name: form.name.trim(),
      category: form.category,
      active: form.active
    };

    let result;
    if (form.id) {
      result = await db.from("brands").update(brandData).eq("id", form.id).select("id").single();
    } else {
      result = await db.from("brands").insert(brandData).select("id").single();
    }

    if (result.error) {
      M(result.error.message);
      return;
    }

    const brandId = result.data.id;
    const volumeRows = selectedVolumes.map(volume_key => ({
      brand_id: brandId,
      volume_key
    }));

    const { error: volumeError } = await db.from("brand_volumes")
      .upsert(volumeRows, { onConflict: "brand_id,volume_key" });

    if (volumeError) {
      M("Brand saved, but bottle sizes could not be saved: " + volumeError.message);
      await loadMaster();
      return;
    }

    // Remove only the brand's current availability selections.
    // Price and daily history rows are deliberately not deleted.
    const { error: removeError } = await db.from("brand_volumes")
      .delete().eq("brand_id", brandId).not("volume_key", "in", `(${selectedVolumes.join(",")})`);

    if (removeError) {
      M("Brand and sizes saved, but old size selections could not be cleared: " + removeError.message);
      await loadMaster();
      return;
    }

    M("Brand and bottle sizes saved.");
    EB(null);
    await loadMaster();
  }

  async function savePrices(id, values) {
    const rows = volumesFor(id).map(v => ({
      brand_id: id,
      volume_key: v[0],
      rate: Number(values[v[0]]) || 0
    }));

    if (!rows.length) {
      M("Select at least one bottle size for this brand first.");
      return;
    }

    const { error } = await db.from("brand_prices")
      .upsert(rows, { onConflict: "brand_id,volume_key" });

    if (error) M(error.message);
    else {
      EP(null);
      M("Prices saved.");
      await loadMaster();
    }
  }

  async function deactivate(id) {
    if (!confirm("Deactivate this brand? Historical entries remain.")) return;
    const { error } = await db.from("brands").update({ active: false }).eq("id", id);
    M(error?.message || "Brand deactivated.");
    await loadMaster();
  }

  async function loadReports() {
    const { data } = await db.from("daily_entries")
      .select("id,entry_date").order("entry_date", { ascending: false }).limit(60);
    const a = [];
    for (const e of data || []) {
      const { data: r } = await db.from("daily_entry_lines")
        .select("*").eq("entry_id", e.id);
      const rows = r || [];
      a.push({
        date: e.entry_date,
        sold: rows.reduce((s, x) => s + x.opening_balance + x.received - x.closing_balance, 0),
        amount: rows.reduce((s, x) =>
          s + (x.opening_balance + x.received - x.closing_balance) * x.rate, 0)
      });
    }
    RP(a);
  }

  async function login(e) {
    e.preventDefault();
    const { error } = await db.auth.signInWithPassword({ email, password: pass });
    if (error) M(error.message);
  }

  if (!configured) {
    return <Center title="Connect Supabase">
      Copy .env.example to .env, add your Supabase project URL and anon key, then follow README.md.
    </Center>;
  }

  if (!session) {
    return (
      <div className="login">
        <form onSubmit={login}>
          <Wine size={42} />
          <h1>GARDEN COURT</h1>
          <p>BAR & RESTAURANT</p>
          <h2>Admin Login</h2>
          <label>Email<input type="email" value={email} onChange={e => E(e.target.value)} required /></label>
          <label>Password<input type="password" value={pass} onChange={e => W(e.target.value)} required /></label>
          {msg && <p className="msg">{msg}</p>}
          <button className="primary">Sign in</button>
          <small>Approved administrator accounts only</small>
        </form>
      </div>
    );
  }

  if (!profile) return <Center title="Checking admin access">{msg || "Loading profile…"}</Center>;
  if (profile.role !== "admin") {
    return <Center title="Admin access required">
      This account is not an administrator. <button onClick={() => db.auth.signOut()}>Sign out</button>
    </Center>;
  }

  const nav = [
    ["stock", "Daily Stock Entry", ClipboardList],
    ["brands", "Brand Master", Tags],
    ["prices", "Price Master", IndianRupee],
    ["reports", "Reports", ChartNoAxesColumn],
    ["history", "Stock History", History],
    ["summary", "Sales Summary", PieChart],
    ["print", "Print Register", Printer]
  ];

  return (
    <div className="shell">
      <header>
        <div className="logo"><Wine /> <span>GARDEN COURT<small>BAR & RESTAURANT</small></span></div>
        <div>
          <ShieldCheck /> RAJU BAR-1 <span>{profile.full_name || session.user.email}</span>
          <button onClick={() => db.auth.signOut()}><LogOut /></button>
        </div>
      </header>

      <aside>
        {nav.map(([id, name, Icon]) => (
          <button className={page === id ? "active" : ""} onClick={() => G(id)} key={id}>
            <Icon />{name}
          </button>
        ))}
      </aside>

      <main>
        {msg && <div className="notice">{msg}<button onClick={() => M("")}>×</button></div>}

        {page === "stock" && (
          <section>
            <div className="heading">
              <div><h1><ClipboardList /> Daily Stock Entry</h1><p>Opening balance, received stock and closing balance by brand and volume</p></div>
              <label><CalendarDays /><input type="date" value={date} onChange={e => D(e.target.value)} /></label>
            </div>
            <div className="tabs">
              {CATS.map(x => <button className={cat === x ? "sel" : ""} onClick={() => C(x)} key={x}>{x}</button>)}
            </div>
            <div className="tools">
              <label><Search /><input placeholder="Search brand" value={search} onChange={e => H(e.target.value)} /></label>
              <button className="secondary" onClick={loadDay}><RefreshCw /> Reload</button>
            </div>
            <div className="table">
              <table>
                <thead><tr>
                  <th>Brand</th><th>Volume</th><th>O.B.</th><th>Rec.</th><th>Total</th>
                  <th>C.B.</th><th>Sales</th><th>Rate (₹)</th><th>Rs. (₹)</th>
                </tr></thead>
                <tbody>
                  {list.map(b => {
                    const available = volumesFor(b.id);
                    return available.map((v, i) => {
                      const x = calc(b, v);
                      return (
                        <tr key={x.key}>
                          {i === 0 && <td rowSpan={available.length} className="brand">{b.name}</td>}
                          <td>{v[1]} ({v[2]} ml)</td>
                          <td><Num value={x.x.ob} change={n => change(x.key, "ob", n)} /></td>
                          <td><Num value={x.x.rec} change={n => change(x.key, "rec", n)} /></td>
                          <td className="calc">{x.total}</td>
                          <td><Num value={x.x.cb} change={n => change(x.key, "cb", n)} max={x.total} /></td>
                          <td className="calc">{x.sold}</td>
                          <td>{cash(x.rate)}</td>
                          <td className="amount">{cash(x.amount)}</td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
            <div className="totals">
              <Stat label="Total stock" value={list.reduce((s, b) => s + volumesFor(b.id).reduce((t, v) => t + calc(b, v).total, 0), 0)} />
              <Stat label="Bottles sold" value={list.reduce((s, b) => s + volumesFor(b.id).reduce((t, v) => t + calc(b, v).sold, 0), 0)} />
              <Stat label="Sales amount" value={cash(list.reduce((s, b) => s + volumesFor(b.id).reduce((t, v) => t + calc(b, v).amount, 0), 0))} />
            </div>
            <div className="actions">
  

  <button className="secondary" onClick={downloadDailyPdf}>
    <Printer /> Download PDF
  </button>

  <button className="primary" disabled={busy} onClick={saveDay}>
    <Save />{busy ? "Saving…" : "Save daily entry"}
  </button>
  </div>
  </section>
        )}

        {page === "brands" && (
          <section>
            <div className="heading">
              <div><h1><Tags /> Brand Master</h1><p>Add and manage brands, categories and bottle sizes</p></div>
              <button className="primary" onClick={() => EB({
                name: "", category: "Brandy", active: true, selectedVolumes: [...DEFAULT_VOLS]
              })}><Plus /> Add brand</button>
            </div>
            <div className="tools">
              <label><Search /><input placeholder="Search brand" value={search} onChange={e => H(e.target.value)} /></label>
            </div>
            <div className="table">
              <table>
                <thead><tr><th>Brand</th><th>Category</th><th>Available sizes</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                 {brands.filter(b =>
  b.active && b.name.toLowerCase().includes(search.toLowerCase())
).map(b => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{b.category}</td>
                      <td>{volumesFor(b.id).map(v => v[1]).join(", ") || "No sizes selected"}</td>
                      <td>{b.active ? "Active" : "Inactive"}</td>
                      <td>
                        <button className="small" onClick={() => EB({
                          ...b, selectedVolumes: [...(brandVolumes[b.id] || DEFAULT_VOLS)]
                        })}><Pencil /> Edit</button>{" "}
                        <button className="small danger" onClick={() => deactivate(b.id)}><Trash2 /> Deactivate</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === "prices" && (
          <section>
            <div className="heading">
              <div><h1><IndianRupee /> Price Master</h1><p>Set separate rates for each brand and its available volumes</p></div>
            </div>
            <div className="table">
              <table>
                <thead><tr><th>Brand</th><th>Category</th><th>Available prices</th><th>Actions</th></tr></thead>
                <tbody>
                  {brands.filter(b => b.active).map(b => {
                    const available = volumesFor(b.id);
                    return (
                      <tr key={b.id}>
                        <td>{b.name}</td>
                        <td>{b.category}</td>
                        <td>{available.map(v => `${v[1]}: ${cash(prices[b.id]?.[v[0]] || 0)}`).join(" | ")}</td>
                        <td>
                          <button className="small" onClick={() => EP({
                            brand: b,
                            volumes: available,
                            values: Object.fromEntries(available.map(v => [v[0], prices[b.id]?.[v[0]] || 0]))
                          })}><Pencil /> Edit prices</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === "reports" && (
          <section>
            <h1><ChartNoAxesColumn /> Reports</h1><p>Saved daily sales history</p>
            <div className="table">
              <table>
                <thead><tr><th>Date</th><th>Bottles sold</th><th>Sales amount</th></tr></thead>
                <tbody>{reports.map(r => <tr key={r.date}><td>{r.date}</td><td>{r.sold}</td><td>{cash(r.amount)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {page === "history" && (
          <section>
            <h1><History /> Stock History</h1>
            <p>Choose a date in Daily Stock Entry to view or update its saved stock register.</p>
            <button className="primary" onClick={() => G("stock")}>Open daily entry</button>
          </section>
        )}

        {page === "summary" && (
          <section>
            <h1><PieChart /> Sales Summary</h1><p>Open Reports to review saved daily totals.</p>
            <button className="primary" onClick={() => G("reports")}>View reports</button>
          </section>
        )}

        {page === "print" && (
          <section>
            <h1><Printer /> Print Register</h1>
            <p>Open the daily register and use the browser print command.</p>
            <button className="primary" onClick={() => window.print()}><Printer /> Print current view</button>
          </section>
        )}
      </main>

      {editBrand && <BrandDialog value={editBrand} close={() => EB(null)} save={saveBrand} />}
      {editPrice && <PriceDialog value={editPrice} close={() => EP(null)} save={savePrices} />}
    </div>
  );
}

function Num({ value, change, max }) {
  return <input className="num" type="number" min="0" max={max} value={value ?? 0} onChange={e => change(e.target.value)} />;
}

function Stat({ label, value }) {
  return <div><small>{label}</small><b>{value}</b></div>;
}

function Center({ title, children }) {
  return <div className="center"><ShieldCheck /><h2>{title}</h2><p>{children}</p></div>;
}

function BrandDialog({ value, close, save }) {
  const [f, F] = useState({
    ...value,
    selectedVolumes: value.selectedVolumes || [...DEFAULT_VOLS]
  });

  function toggleVolume(key, checked) {
    F(old => ({
      ...old,
      selectedVolumes: checked
        ? [...old.selectedVolumes, key]
        : old.selectedVolumes.filter(x => x !== key)
    }));
  }

  return (
    <div className="shade">
      <form className="modal" onSubmit={e => {
        e.preventDefault();
        if (!f.selectedVolumes.length) {
          alert("Please select at least one bottle size.");
          return;
        }
        save(f);
      }}>
        <h2>{value.id ? "Edit brand" : "Add brand"}</h2>
        <label>Brand name
          <input required value={f.name} onChange={e => F({ ...f, name: e.target.value })} />
        </label>
        <label>Category
          <select value={f.category} onChange={e => F({ ...f, category: e.target.value })}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="volume-picker">
          <strong>Available bottle sizes</strong>
          <p>Select the sizes sold by this brand:</p>
          {VOLS.map(v => (
            <label className="check" key={v[0]}>
              <input
                type="checkbox"
                checked={f.selectedVolumes.includes(v[0])}
                onChange={e => toggleVolume(v[0], e.target.checked)}
              />
              {v[1]} ({v[2]} ml)
            </label>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={f.active} onChange={e => F({ ...f, active: e.target.checked })} />
          Active
        </label>
        <div className="actions">
          <button type="button" className="secondary" onClick={close}>Cancel</button>
          <button className="primary">Save brand</button>
        </div>
      </form>
    </div>
  );
}

function PriceDialog({ value, close, save }) {
  const [f, F] = useState(value.values);
  return (
    <div className="shade">
      <form className="modal" onSubmit={e => {
        e.preventDefault();
        save(value.brand.id, f);
      }}>
        <h2>Prices — {value.brand.name}</h2>
        {value.volumes.map(v => (
          <label key={v[0]}>
            {v[1]} ({v[2]} ml) price ₹
            <input
              type="number"
              min="0"
              value={f[v[0]] ?? 0}
              onChange={e => F({ ...f, [v[0]]: e.target.value })}
            />
          </label>
        ))}
        <div className="actions">
          <button type="button" className="secondary" onClick={close}>Cancel</button>
          <button className="primary">Save prices</button>
        </div>
      </form>
    </div>
  );
}
