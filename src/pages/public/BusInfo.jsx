import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSite, pick } from '../../lib/store'
import PageHead from '../../components/PageHead'

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '')

// অভিভাবকের জন্য বাসের তথ্য: শিক্ষার্থীর আইডি + জন্মতারিখ
export default function BusInfo() {
  const { t, lang } = useSite()
  const [no, setNo] = useState('')
  const [dob, setDob] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    setErr(''); setRes(null)
    if (!no.trim() || !dob) return setErr(t('bus.notfound'))
    setBusy(true)
    const { data, error } = await supabase.rpc('public_bus_info', { p_no: no.replace(/[০-৯]/g, (x) => '০১২৩৪৫৬৭৮৯'.indexOf(x)), p_dob: dob })
    setBusy(false)
    if (error || !data) return setErr(t('bus.notfound'))
    setRes(data)
  }
  const r = res && res.route
  return (
    <>
      <PageHead title={t('bus.title')} sub={t('bus.sub')} />
      <section className="section">
        <div className="container stack" style={{ maxWidth: 640 }}>
          {res && res.closed ? <div className="card">{t('bus.closed')}</div> : (
            <form className="card stack" onSubmit={submit}>
              <div className="grid g2">
                <div className="field"><label>{t('result.id')}</label><input value={no} onChange={(e) => setNo(e.target.value)} inputMode="numeric" autoComplete="off" /></div>
                <div className="field"><label>{t('result.dob')}</label><input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
              </div>
              <button className="btn" disabled={busy}>{t('bus.submit')}</button>
              {err && <div className="alert err">{err}</div>}
            </form>
          )}
          {res && !res.closed && (
            <div className="card stack">
              <h3 style={{ margin: 0 }}>{pick(res.student, 'name', lang)}</h3>
              {!r ? <p className="muted" style={{ margin: 0 }}>{t('bus.none')}</p> : (
                <div className="table-wrap"><table><tbody>
                  <tr><td>{t('bus.route')}</td><td><b>{r.name}</b></td></tr>
                  {r.vehicle_no && <tr><td>{t('bus.vehicle')}</td><td>{r.vehicle_no}</td></tr>}
                  {r.driver_name && <tr><td>{t('bus.driver')}</td><td>{r.driver_name}</td></tr>}
                  {r.driver_phone && <tr><td>{t('bus.phone')}</td><td><a href={`tel:${r.driver_phone}`}>{r.driver_phone}</a></td></tr>}
                  {Number(r.fare) > 0 && <tr><td>{t('bus.fare')}</td><td>৳ {Number(r.fare).toLocaleString(lang === 'en' ? 'en-US' : 'bn-BD')}</td></tr>}
                </tbody></table></div>
              )}
              {r && safeUrl(r.tracking_url) && <a className="btn" href={safeUrl(r.tracking_url)} target="_blank" rel="noreferrer">{t('bus.track')}</a>}
              {res.notice && <div className="alert info pre">{res.notice}</div>}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
