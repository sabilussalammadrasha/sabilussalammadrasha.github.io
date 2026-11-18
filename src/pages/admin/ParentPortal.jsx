import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth, useSite, pick } from '../../lib/store'
import { dig } from '../../lib/util'
import PageHead from '../../components/PageHead'

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '')
const ST = { present: ['pp.present', '#1a8a4a'], late: ['pp.late', '#c98a00'], absent: ['pp.absent', '#c0262d'], leave: ['pp.leave', '#4a6fa5'] }
const cleanNo = (v) => String(v || '').replace(/[০-৯]/g, (x) => '০১২৩৪৫৬৭৮৯'.indexOf(x))

// অভিভাবক পোর্টাল: সন্তানের হাজিরা, ফলাফল, ফি ও বাসের তথ্য
export default function ParentPortal() {
  const { t, lang, modules } = useSite()
  const { session, loading } = useAuth()
  const d = (v) => dig(v, lang)
  const money = (v) => `৳ ${Number(v || 0).toLocaleString(lang === 'en' ? 'en-US' : 'bn-BD')}`
  const [kids, setKids] = useState(null)
  const [sel, setSel] = useState('')
  const [info, setInfo] = useState(null)
  const [adding, setAdding] = useState(false)
  const [no, setNo] = useState('')
  const [dob, setDob] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const on = modules.parent_portal === true

  const loadKids = useCallback(async (pickId) => {
    const { data } = await supabase.rpc('my_children')
    const list = data || []
    setKids(list)
    setSel((cur) => pickId || (list.some((k) => k.id === cur) ? cur : list[0]?.id || ''))
    if (!list.length) setAdding(true)
  }, [])
  useEffect(() => { if (session && on) loadKids() }, [session, on, loadKids])
  useEffect(() => {
    setInfo(null); setRes(null)
    if (!sel) return
    supabase.rpc('parent_child', { p_student: sel }).then(({ data }) => setInfo(data || null))
  }, [sel])

  async function add(e) {
    e.preventDefault()
    setMsg(''); setBusy(true)
    const { data, error } = await supabase.rpc('link_child', { p_no: cleanNo(no), p_dob: dob || null })
    setBusy(false)
    if (error) return setMsg(error.message)
    if (data?.error) return setMsg(data.error)
    setNo(''); setDob(''); setAdding(false)
    loadKids(data?.id)
  }
  async function unlink(id) {
    if (!window.confirm(`${t('pp.unlink')}?`)) return
    await supabase.rpc('unlink_child', { p_student: id })
    setSel(''); loadKids()
  }
  async function showResult(x) {
    setRes({ loading: true })
    const { data } = await supabase.rpc('parent_result', { p_student: sel, p_exam: x.exam_id, p_class: x.class_id })
    setRes(data || null)
  }

  if (loading) return <section className="section"><div className="container center muted">{t('common.loading')}</div></section>
  const head = <PageHead title={t('pp.title')} sub={t('pp.sub')} />
  if (!on) return <>{head}<section className="section"><div className="container"><div className="card center"><b>{t('pp.closed')}</b></div></div></section></>
  if (!session) return <>{head}<section className="section"><div className="container"><div className="card center stack"><b>{t('pp.login')}</b><Link className="btn" to="/account">{t('nav.login')}</Link></div></div></section></>

  const a = info?.attendance
  const f = info?.fees
  const r = info?.bus
  const rr = res && !res.loading ? res : null
  return (
    <>
      {head}
      <section className="section">
        <div className="container stack" style={{ maxWidth: 860 }}>
          {kids && kids.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {kids.map((k) => <button key={k.id} type="button" className={`btn small ${sel === k.id && !adding ? '' : 'outline'}`} onClick={() => { setSel(k.id); setAdding(false) }}>{pick(k, 'name', lang)}</button>)}
              <button type="button" className={`btn small ${adding ? '' : 'outline'}`} onClick={() => setAdding(!adding)}>+ {t('pp.add')}</button>
            </div>
          )}
          {adding && (
            <form className="card stack" onSubmit={add}>
              {kids && kids.length === 0 && <div className="muted">{t('pp.none')}</div>}
              <b>{t('pp.add')}</b>
              <div className="muted">{t('pp.add.hint')}</div>
              <div className="grid g2">
                <div className="field"><label>{t('result.id')}</label><input value={no} onChange={(e) => setNo(e.target.value)} inputMode="numeric" autoComplete="off" /></div>
                <div className="field"><label>{t('result.dob')}</label><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
              </div>
              <button className="btn" disabled={busy}>{t('pp.add.btn')}</button>
              {msg && <div className="alert err">{msg}</div>}
            </form>
          )}

          {!adding && sel && !info && <div className="muted center">{t('common.loading')}</div>}
          {!adding && info && (
            <>
              <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                {info.student.photo_url && <img src={info.student.photo_url} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover' }} />}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <h3 style={{ margin: 0 }}>{pick(info.student, 'name', lang)}</h3>
                  <div className="muted">{t('result.id')}: {d(info.student.student_no)}{info.student.class_bn ? ` · ${t('pp.class')}: ${pick({ name_bn: info.student.class_bn, name_en: info.student.class_en }, 'name', lang)}` : ''}</div>
                </div>
                <button type="button" className="btn small outline" onClick={() => unlink(sel)}>{t('pp.unlink')}</button>
              </div>

              <div className="card stack">
                <h3 style={{ margin: 0 }}>{t('pp.att')}</h3>
                {!a || a.total === 0 ? <div className="muted">{t('pp.att.none')}</div> : (
                  <>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {Object.entries(ST).map(([k, [l, c]]) => <div key={k} className="card" style={{ minWidth: 96, textAlign: 'center', padding: '10px 14px' }}><div className="muted" style={{ fontSize: '.85rem' }}>{t(l)}</div><b style={{ fontSize: '1.4rem', color: c }}>{d(a[k])}</b></div>)}
                    </div>
                    <div className="muted">{t('pp.att.recent')}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.recent.map((x) => <span key={x.date} title={`${x.date} — ${t(ST[x.status]?.[0] || 'pp.present')}`} style={{ border: `1px solid ${ST[x.status]?.[1]}`, color: ST[x.status]?.[1], borderRadius: 8, padding: '3px 8px', fontSize: '.85rem' }}>{d(x.date.slice(8, 10) + '/' + x.date.slice(5, 7))} · {t(ST[x.status]?.[0] || 'pp.present')}</span>)}
                    </div>
                  </>
                )}
              </div>

              <div className="card stack">
                <h3 style={{ margin: 0 }}>{t('pp.fees')}</h3>
                {f && Number(f.due) > 0 ? (
                  <>
                    <div><span className="muted">{t('pp.due')}: </span><b style={{ fontSize: '1.3rem', color: '#c0262d' }}>{money(f.due)}</b></div>
                    <div className="table-wrap"><table><tbody>{f.unpaid.map((x, i) => <tr key={i}><td>{x.title}</td><td style={{ textAlign: 'right' }}>{money(Number(x.amount) - Number(x.paid))}</td></tr>)}</tbody></table></div>
                  </>
                ) : <div className="muted">{t('pp.nodue')}</div>}
                {f && f.payments.length > 0 && (
                  <>
                    <div className="muted">{t('pp.pays')}</div>
                    <div className="table-wrap"><table><tbody>{f.payments.map((x, i) => <tr key={i}><td>{d(x.paid_at)}</td><td>{x.receipt_no ? d(x.receipt_no) : ''}</td><td style={{ textAlign: 'right' }}>{money(x.amount)}</td></tr>)}</tbody></table></div>
                  </>
                )}
              </div>

              <div className="card stack">
                <h3 style={{ margin: 0 }}>{t('pp.exams')}</h3>
                {info.exams.length === 0 ? <div className="muted">{t('pp.exams.none')}</div> : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {info.exams.map((x) => <button key={x.exam_id + x.class_id} type="button" className="btn small outline" onClick={() => showResult(x)}>{pick(x, 'name', lang)}{x.year ? ` (${d(x.year)})` : ''}</button>)}
                  </div>
                )}
                {res && res.loading && <div className="muted">{t('common.loading')}</div>}
                {rr && (
                  <>
                    <div className="table-wrap"><table>
                      <thead><tr><th>{t('result.subject')}</th><th>{t('result.full')}</th><th>{t('result.marks')}</th></tr></thead>
                      <tbody>{rr.subjects.map((s, i) => {
                        const fail = !s.absent && s.marks !== null && Number(s.marks) < Number(s.pass)
                        return <tr key={i}><td>{pick(s, 'name', lang)}</td><td>{d(Number(s.full))}</td><td style={{ color: fail || s.absent ? '#c0262d' : undefined, fontWeight: fail ? 700 : 400 }}>{s.absent ? t('result.absent') : s.marks === null ? '—' : d(Number(s.marks))}</td></tr>
                      })}</tbody>
                    </table></div>
                    {rr.result && (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {[['total', 'result.total'], ['avg', 'result.avg'], ['division', 'result.division'], ['merit', 'result.merit']].filter(([k]) => rr.result[k]).map(([k, l]) => <div className="card" key={k} style={{ padding: '10px 14px' }}><div className="muted" style={{ fontSize: '.85rem' }}>{t(l)}</div><b>{d(rr.result[k])}</b></div>)}
                      </div>
                    )}
                  </>
                )}
              </div>

              {r && (
                <div className="card stack">
                  <h3 style={{ margin: 0 }}>{t('pp.bus')}</h3>
                  <div className="table-wrap"><table><tbody>
                    <tr><td>{t('bus.route')}</td><td><b>{r.name}</b></td></tr>
                    {r.vehicle_no && <tr><td>{t('bus.vehicle')}</td><td>{r.vehicle_no}</td></tr>}
                    {r.driver_name && <tr><td>{t('bus.driver')}</td><td>{r.driver_name}</td></tr>}
                    {r.driver_phone && <tr><td>{t('bus.phone')}</td><td><a href={`tel:${r.driver_phone}`}>{r.driver_phone}</a></td></tr>}
                    {Number(r.fare) > 0 && <tr><td>{t('bus.fare')}</td><td>{money(r.fare)}</td></tr>}
                  </tbody></table></div>
                  {safeUrl(r.tracking_url) && <a className="btn" href={safeUrl(r.tracking_url)} target="_blank" rel="noreferrer">{t('bus.track')}</a>}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  )
}
