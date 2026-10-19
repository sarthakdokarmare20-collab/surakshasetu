import { useState } from 'react'
import { Phone, X } from 'lucide-react'
import { CATS, HELPERS, REASONS, STEPS, type Report, type Sess, type Status } from '../data/community'

const Sim = ({ t }: { t: string }) => <p className="notice info"><b>{t}</b></p>

export function Timeline({ s, setS, say }: { s: Sess; setS: (s: Sess | null) => void; say: (m: string) => void }) {
  const done = s.step === 4
  return <div><p><b>{s.id}</b> <span className="tag">SIMULATED</span></p>
    {STEPS.map((t, i) => <div key={t} className={'tl' + (i <= s.step && !s.cancelled ? ' done' : '')}><span className="tl-dot" />{t}</div>)}
    {s.cancelled ? <p className="pi-err">Request cancelled.</p> : <div className="row">
      {!done && <button className="btn" onClick={() => setS({ ...s, step: s.step + 1 })}>Simulate next step</button>}
      {!done && <button className="btn primary" onClick={() => { setS({ ...s, step: 4 }); say('Marked resolved') }}>Mark resolved</button>}
      {!done && <button className="btn" onClick={() => { setS({ ...s, cancelled: true }); say('Request cancelled') }}>Cancel</button>}
      <a className="btn danger" href="tel:112"><Phone size={15} />Call 112</a></div>}
    {(s.cancelled || done) && <button className="btn" onClick={() => setS(null)}>Clear</button>}
    <p className="mut small">Location sharing: {s.share ? 'approximate (simulated, nothing is sent)' : 'not shared'} · Reason: {s.reason}</p></div>
}

export function SosModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (s: Sess) => void }) {
  const [reason, setReason] = useState(''); const [msg, setMsg] = useState(''); const [share, setShare] = useState<boolean | null>(null); const [err, setErr] = useState('')
  const submit = () => { if (!reason) return setErr('Choose a reason.'); if (share === null) return setErr('Choose a location option.'); onSubmit({ id: 'SOS-SIM-' + Math.floor(1000 + Math.random() * 9000), step: 0, cancelled: false, reason, share }) }
  return <div className="modal" onClick={onClose}><div className="sheet" role="dialog" aria-label="Request community help" onClick={e => e.stopPropagation()}>
    <div className="sheet-head"><h3>Request community help</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    <Sim t="SIMULATION: no alert is sent to anyone." />
    <a className="btn danger block" href="tel:112"><Phone size={15} />In danger? Call 112 now</a>
    {REASONS.map(r => <label key={r} className={'opt' + (reason === r ? ' on' : '')}><input type="radio" checked={reason === r} onChange={() => setReason(r)} />{r}</label>)}
    <textarea maxLength={160} rows={2} placeholder="Optional short message" value={msg} onChange={e => setMsg(e.target.value)} />
    <label className={'opt' + (share === true ? ' on' : '')}><input type="radio" checked={share === true} onChange={() => setShare(true)} />Approximate location</label>
    <label className={'opt' + (share === false ? ' on' : '')}><input type="radio" checked={share === false} onChange={() => setShare(false)} />Do not share location</label>
    <p className="mut small">This prototype never reads your real location and never sends data anywhere.</p>{err && <p className="pi-err">{err}</p>}
    <button className="btn primary block" onClick={submit}>Submit simulated request</button></div></div>
}

export function ReportModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (r: Report) => void }) {
  const [cat, setCat] = useState(CATS[0]); const [desc, setDesc] = useState(''); const [loc, setLoc] = useState('')
  return <div className="modal" onClick={onClose}><div className="sheet" role="dialog" aria-label="Report a concern" onClick={e => e.stopPropagation()}>
    <div className="sheet-head"><h3>Report a safety concern</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    <Sim t="Stored only in this browser tab. Not sent or reviewed by anyone." />
    <select value={cat} onChange={e => setCat(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
    <textarea rows={3} placeholder="Optional description (no names or personal details)" value={desc} onChange={e => setDesc(e.target.value)} />
    <input type="text" placeholder="Optional approximate location" value={loc} onChange={e => setLoc(e.target.value)} />
    <button className="btn primary block" onClick={() => onSubmit({ id: 'RPT-' + Date.now() % 100000, cat, desc, loc, status: 'pending' })}>Submit report</button></div></div>
}

export function CommunityModal({ onClose, sess, setSess, reports, setReports, openSos, openReport, say }: { onClose: () => void; sess: Sess | null; setSess: (s: Sess | null) => void; reports: Report[]; setReports: (f: (r: Report[]) => Report[]) => void; openSos: () => void; openReport: () => void; say: (m: string) => void }) {
  const [admin, setAdmin] = useState(false)
  const mark = (id: string, status: Status) => setReports(rs => rs.map(x => x.id === id ? { ...x, status } : x))
  return <div className="modal" onClick={onClose}><div className="sheet wide" role="dialog" aria-label="Community" onClick={e => e.stopPropagation()}>
    <div className="sheet-head"><h3>Community safety (simulated)</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    <Sim t="Prototype features. Nobody real is alerted; reports stay in this browser tab." />
    <div className="cols"><div><h4>Community help</h4>
      {HELPERS.map(h => <p key={h.name}><b>{h.name}</b> <span className="tag">Simulated</span><br /><span className="mut">{h.skill}</span></p>)}
      {sess ? <Timeline s={sess} setS={setSess} say={say} /> : <button className="btn danger" onClick={openSos}>Request community help</button>}</div>
      <div><div className="row between"><h4>Safety reports</h4><button className="btn primary" onClick={openReport}>Report a concern</button></div>
        <label className="opt inline"><input type="checkbox" checked={admin} onChange={() => setAdmin(!admin)} />Demo admin view</label>
        {reports.length === 0 && <p className="mut">No reports yet.</p>}
        {reports.map(r => <div key={r.id} className="report"><b>{r.cat}</b> <span className="tag">{r.status === 'pending' ? 'Pending review (simulated)' : r.status}</span>
          <p className="mut small">{r.desc || 'No description'} · {r.loc || 'No location given'}</p>
          {admin && r.status === 'pending' && <div className="row"><button className="btn" onClick={() => mark(r.id, 'reviewed')}>Mark reviewed</button><button className="btn" onClick={() => mark(r.id, 'rejected')}>Reject</button></div>}</div>)}</div></div>
  </div></div>
}
