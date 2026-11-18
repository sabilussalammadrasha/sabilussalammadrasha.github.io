import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAll } from '../../lib/db'
import { useConfirm } from '../../components/Ui'
import { nm } from './fin'

// অভিভাবক সংযোগ: কোন অভিভাবক কোন সন্তানকে যুক্ত করেছেন, দেখা, হাতে যুক্ত করা ও সরানো
export default function ParentLinks() {
  const confirm = useConfirm()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [email, setEmail] = useState('')
  const [no, setNo] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data: links } = await fetchAll((a, b) => supabase.from('parent_students').select('parent_id,student_id,created_at,status').order('created_at', { ascending: false }).range(a, b))
    const L = links || []
    const pids = [...new Set(L.map((x) => x.parent_id))], sids = [...new Set(L.map((x) => x.student_id))]
    const P = {}, S = {}
    for (let i = 0; i < pids.length; i += 100) { const { data } = await supabase.from('profiles').select('id,full_name,email').in('id', pids.slice(i, i + 100)); (data || []).forEach((p) => { P[p.id] = p }) }
    for (let i = 0; i < sids.length; i += 100) { const { data } = await supabase.from('students').select('id,student_no,name_bn,name_en').in('id', sids.slice(i, i + 100)); (data || []).forEach((s) => { S[s.id] = s }) }
    const cnt = {}
    L.forEach((x) => { cnt[x.parent_id] = (cnt[x.parent_id] || 0) + 1 })
    const out = L.map((x) => ({ ...x, n: cnt[x.parent_id], p: P[x.parent_id] || {}, s: S[x.student_id] || {} }))
    // অনুমোদনের অপেক্ষায় থাকা আগে, তারপর একই অভিভাবকের সন্তানরা পাশাপাশি
    out.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || String(a.p.email || a.parent_id).localeCompare(String(b.p.email || b.parent_id)))
    setRows(out)
  }, [])
  useEffect(() => { load() }, [load])

  async function add(e) {
    e.preventDefault()
    setMsg('')
    const { data: p } = await supabase.from('profiles').select('id').ilike('email', email.trim()).maybeSingle()
    if (!p) return setMsg('এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি। অভিভাবককে আগে সাইটে সাইন আপ করতে বলুন।')
    const { data: s } = await supabase.from('students').select('id').ilike('student_no', no.trim()).maybeSingle()
    if (!s) return setMsg('এই আইডির শিক্ষার্থী পাওয়া যায়নি।')
    const { error } = await supabase.from('parent_students').upsert({ parent_id: p.id, student_id: s.id, status: 'approved' })
    if (error) return setMsg(`যুক্ত হয়নি: ${error.message}`)
    await supabase.from('profiles').update({ role: 'parent' }).eq('id', p.id).eq('role', 'none')
    setEmail(''); setNo(''); setMsg('যুক্ত হয়েছে।'); load()
  }
  async function approve(x) {
    const { error } = await supabase.from('parent_students').update({ status: 'approved' }).eq('parent_id', x.parent_id).eq('student_id', x.student_id)
    if (error) return setMsg(`অনুমোদন হয়নি: ${error.message}`)
    load()
  }
  async function remove(x) {
    if (!(await confirm({ name: `${nm(x.s)} — ${x.p.full_name || x.p.email || ''}`, text: 'এই সংযোগটি সরানো হবে। অভিভাবক চাইলে আবার যুক্ত করতে পারবেন।', ok: 'সরান' }))) return
    await supabase.from('parent_students').delete().eq('parent_id', x.parent_id).eq('student_id', x.student_id)
    load()
  }
  const k = q.trim().toLowerCase()
  const list = k ? rows.filter((x) => `${x.p.full_name || ''} ${x.p.email || ''} ${x.s.student_no || ''} ${x.s.name_bn || ''}`.toLowerCase().includes(k)) : rows
  return (
    <>
      <h2>অভিভাবক সংযোগ</h2>
      <p className="muted">অভিভাবক পোর্টালে সন্তানের আইডি ও জন্মতারিখ দিয়ে অনুরোধ পাঠান; আপনি "অনুমোদন" দিলে তবেই সন্তানের তথ্য তাঁর পোর্টালে দেখা যায়। হাতে যুক্ত করলে সরাসরি অনুমোদিত হয়।</p>
      <form className="card form" onSubmit={add} style={{ marginBottom: 14 }}>
        <b>হাতে যুক্ত করুন</b>
        <div className="grid g2">
          <div className="field"><label>অভিভাবকের অ্যাকাউন্টের ইমেইল</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label>শিক্ষার্থীর আইডি</label><input required value={no} onChange={(e) => setNo(e.target.value)} /></div>
        </div>
        <button className="btn small">যুক্ত করুন</button>
        {msg && <div className={`alert ${/হয়নি|পাওয়া/.test(msg) ? 'err' : 'ok'}`}>{msg}</div>}
      </form>
      <div className="field"><input placeholder="খুঁজুন: নাম, ইমেইল বা আইডি" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="table-wrap"><table>
        <thead><tr><th>অভিভাবক</th><th>ইমেইল</th><th>সন্তান</th><th>আইডি</th><th>অবস্থা</th><th /></tr></thead>
        <tbody>
          {list.map((x) => <tr key={x.parent_id + x.student_id}><td>{x.p.full_name || '—'}</td><td>{x.p.email || '—'}{x.n > 1 && <div className="muted" style={{ fontSize: '.8rem' }}>এই অভিভাবকের মোট {x.n.toLocaleString('bn-BD')} জন সন্তান যুক্ত</div>}</td><td>{nm(x.s)}</td><td>{x.s.student_no}</td><td>{x.status === 'pending' ? <b style={{ color: '#c98a00' }}>অনুমোদনের অপেক্ষায়</b> : <span style={{ color: '#1a8a4a' }}>অনুমোদিত</span>}</td><td style={{ whiteSpace: 'nowrap' }}>{x.status === 'pending' && <button className="btn small" style={{ marginRight: 6 }} onClick={() => approve(x)}>অনুমোদন</button>}<button className="btn small danger" onClick={() => remove(x)}>সরান</button></td></tr>)}
          {list.length === 0 && <tr><td colSpan={6} className="muted">কোনো সংযোগ নেই।</td></tr>}
        </tbody>
      </table></div>
    </>
  )
}
