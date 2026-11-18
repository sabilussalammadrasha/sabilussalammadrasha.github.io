import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAll } from '../../lib/db'
import { useConfig } from '../../lib/config'
import { Select, useConfirm } from '../../components/Ui'
import { useClassList } from './Exams'
import { nm, num, todayStr } from './fin'

const bn = (n, d = 0) => Number(n || 0).toLocaleString('bn-BD', { maximumFractionDigits: d })
const DEFAULTS = { subject: 'উপস্থিতি', max: 5, leave_counts: true, late_counts: true }
const half = (v) => Math.round(v * 2) / 2

// উপস্থিতি নম্বর: হাজিরা থেকে শতকরা হার বের করে পরীক্ষার একটি বিষয় ("উপস্থিতি") হিসেবে নম্বর বসানো।
// এতে মেধাতালিকা, মার্কশিট ও পাবলিক রেজাল্টে নম্বর নিজে থেকেই যোগ হয়।
export default function AttendanceMarks() {
  const confirm = useConfirm()
  const classes = useClassList()
  const { cfg, setCfg, save, ready } = useConfig('attendance_marks', DEFAULTS)
  const [exams, setExams] = useState([])
  const [exam, setExam] = useState('')
  const [cls, setCls] = useState('')
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(todayStr())
  const [stu, setStu] = useState([])
  const [att, setAtt] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { supabase.from('exams').select('*').order('created_at', { ascending: false }).then(({ data }) => setExams(data || [])) }, [])
  useEffect(() => {
    const e = exams.find((x) => x.id === exam)
    if (!e) return
    const y = /^\d{4}$/.test(String(e.year || '')) ? e.year : String(new Date().getFullYear())
    setFrom(`${y}-01-01`)
    setTo(e.date_from && e.date_from < todayStr() ? e.date_from : todayStr())
  }, [exam]) // eslint-disable-line

  useEffect(() => {
    setStu([]); setAtt([]); setMsg('')
    if (!cls) return
    ;(async () => {
      const s = await fetchAll((a, b) => supabase.from('students').select('id,student_no,name_bn,name_en').eq('class_id', cls).eq('status', 'active').order('id').range(a, b))
      const list = s.data || []
      setStu(list)
      let rows = []
      for (let i = 0; i < list.length; i += 120) {
        const ids = list.slice(i, i + 120).map((x) => x.id)
        const r = await fetchAll((a, b) => supabase.from('attendance').select('person_id,date,status').eq('person_type', 'student').in('person_id', ids).gte('date', from).lte('date', to).order('id').range(a, b))
        rows = rows.concat(r.data || [])
      }
      setAtt(rows)
    })()
  }, [cls, from, to])

  const calc = useMemo(() => {
    const days = new Set(att.map((a) => a.date))
    const total = days.size
    const by = {}
    att.forEach((a) => { (by[a.person_id] = by[a.person_id] || {})[a.date] = a.status })
    const rows = stu.map((s) => {
      let p = 0
      days.forEach((d) => {
        const st = (by[s.id] || {})[d]
        if (st === 'present' || (st === 'late' && cfg.late_counts) || (st === 'leave' && cfg.leave_counts)) p += 1
      })
      const pct = total ? (p / total) * 100 : 0
      return { s, p, pct, marks: total ? Math.min(num(cfg.max), half((num(cfg.max) * pct) / 100)) : 0 }
    })
    return { total, rows }
  }, [att, stu, cfg.max, cfg.late_counts, cfg.leave_counts])

  async function apply() {
    if (!exam || !cls || !calc.rows.length || !calc.total) return
    if (!(await confirm({ danger: false, name: `${bn(calc.rows.length)} জনের উপস্থিতি নম্বর`, text: `"${cfg.subject}" নামে একটি বিষয় (পূর্ণমান ${bn(cfg.max)}) এই পরীক্ষা ও শ্রেণিতে যোগ হবে এবং নম্বর বসবে। আগে বসানো থাকলে নতুন হিসাবে বদলে যাবে।`, ok: 'হ্যাঁ, বসান' }))) return
    setBusy(true); setMsg('')
    try {
      const nameSub = (cfg.subject || 'উপস্থিতি').trim()
      let { data: sub } = await supabase.from('exam_subjects').select('*').eq('exam_id', exam).eq('class_id', cls).eq('name_bn', nameSub).maybeSingle()
      if (!sub) {
        const r = await supabase.from('exam_subjects').insert({ exam_id: exam, class_id: cls, name_bn: nameSub, name_en: 'Attendance', full_marks: num(cfg.max), pass_marks: 0, sort: 999 }).select().single()
        if (r.error) throw r.error
        sub = r.data
      } else if (num(sub.full_marks) !== num(cfg.max)) {
        const r = await supabase.from('exam_subjects').update({ full_marks: num(cfg.max) }).eq('id', sub.id)
        if (r.error) throw r.error
      }
      const rows = calc.rows.map((r) => ({ exam_id: exam, subject_id: sub.id, student_id: r.s.id, marks: r.marks, absent: false, updated_at: new Date().toISOString() }))
      for (let i = 0; i < rows.length; i += 400) {
        const { error } = await supabase.from('exam_marks').upsert(rows.slice(i, i + 400), { onConflict: 'subject_id,student_id' })
        if (error) throw error
      }
      setMsg(`${bn(rows.length)} জনের উপস্থিতি নম্বর বসেছে। "পরীক্ষা ও ফলাফল" এ "${nameSub}" বিষয় হিসেবে দেখা যাবে।`)
    } catch (e) { setMsg(`ত্রুটি: ${e.message}`) }
    setBusy(false)
  }
  if (!ready) return null
  const up = (k, v) => setCfg((c) => ({ ...c, [k]: v }))
  return (
    <div className="card form">
      <p className="muted" style={{ marginTop: 0 }}>হাজিরার হার অনুযায়ী পরীক্ষায় উপস্থিতির নম্বর দেওয়া যায়। নম্বর = পূর্ণমান × উপস্থিতির শতকরা হার (সবচেয়ে কাছের ০.৫ এ)। নম্বর পরীক্ষার একটি বিষয় হিসেবে বসে, তাই মোট নম্বর, মেধাতালিকা ও মার্কশিটে নিজে থেকেই যোগ হয়। চাইলে "নম্বর এন্ট্রি" থেকে হাতে বদলানো যায়। বিষয়টির পাশ নম্বর ০, তাই এতে কেউ ফেল হয় না। তবে বিষয় হিসেবে ধরা হয় বলে GPA গড়ে এটিও যোগ হয়।</p>
      <div className="grid g3">
        <div className="field"><label>পরীক্ষা</label><Select value={exam} onChange={setExam} options={exams.map((e) => [e.id, `${nm(e)}${e.year ? ` — ${e.year}` : ''}`])} placeholder="পরীক্ষা বাছুন" /></div>
        <div className="field"><label>শ্রেণি</label><Select value={cls} onChange={setCls} options={classes.map((c) => [c.id, nm(c)])} placeholder="শ্রেণি বাছুন" /></div>
        <div className="field"><label>পূর্ণ নম্বর</label><input type="number" min="1" value={cfg.max} onChange={(e) => up('max', e.target.value)} /></div>
      </div>
      <div className="grid g3">
        <div className="field"><label>হাজিরা ধরা শুরু</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>হাজিরা ধরা শেষ</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="field"><label>বিষয়ের নাম</label><input value={cfg.subject} onChange={(e) => up('subject', e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.late_counts} onChange={(e) => up('late_counts', e.target.checked)} /> "দেরি" কে উপস্থিত ধরুন</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.leave_counts} onChange={(e) => up('leave_counts', e.target.checked)} /> "ছুটি" কে উপস্থিত ধরুন</label>
        <button className="btn small outline" onClick={async () => { const e = await save(cfg); setMsg(e ? `ত্রুটি: ${e.message}` : 'সেটিংস সংরক্ষিত হয়েছে') }}>সেটিংস সংরক্ষণ</button>
      </div>
      {cls && (
        <>
          <p style={{ margin: '4px 0' }}>এই সময়ে হাজিরা নেওয়া হয়েছে: <b>{bn(calc.total)}</b> দিন · শিক্ষার্থী: <b>{bn(stu.length)}</b> জন</p>
          {calc.total === 0 && <div className="alert info">এই সময়ে এই শ্রেণির কোনো হাজিরা পাওয়া যায়নি। তারিখ বদলে দেখুন।</div>}
          {calc.total > 0 && (
            <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}><table>
              <thead><tr><th>আইডি</th><th>নাম</th><th>উপস্থিত দিন</th><th>হার</th><th>নম্বর</th></tr></thead>
              <tbody>{calc.rows.map((r) => <tr key={r.s.id}><td>{r.s.student_no}</td><td>{nm(r.s)}</td><td>{bn(r.p)} / {bn(calc.total)}</td><td>{bn(r.pct, 1)}%</td><td><b>{bn(r.marks, 1)}</b></td></tr>)}</tbody>
            </table></div>
          )}
          <button className="btn" style={{ marginTop: 12 }} disabled={busy || !exam || !calc.total} onClick={apply}>{busy ? 'অপেক্ষা করুন…' : 'পরীক্ষার নম্বরে বসান'}</button>
        </>
      )}
      {msg && <div className={`alert ${/ত্রুটি/.test(msg) ? 'err' : 'ok'}`} style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  )
}
