'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Panel {
  id: number
  caption: string
  imagePrompt: string
  dialogue: string
  stageDirection: string
}

interface GenerateResult {
  styleDescription: string
  panels: Panel[]
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

interface RefLink {
  id: number
  url: string
}

type ImgStatus = 'idle' | 'loading' | 'loaded' | 'failed'

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZES = ['1080×1920', '1080×1080', '1920×1080', '직접 입력']
const CONTENT_TYPES = ['홍보 영상', 'SNS 숏폼 영상', '브랜딩 영상', '기타']
const CONTENT_FORMS = ['촬영형', 'AI 영상', '모션그래픽', '3D 영상', '일러스트', '기타']

// ─── Utilities ────────────────────────────────────────────────────────────────

async function compressImageFile(file: File, maxPx = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.width
      let h = img.height
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round((h * maxPx) / w); w = maxPx }
        else { w = Math.round((w * maxPx) / h); h = maxPx }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = url
  })
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

// ─── Helper Components ────────────────────────────────────────────────────────

function StepHeader({
  number, title, optional,
}: {
  number: string
  title: string
  optional?: boolean
}) {
  return (
    <h2 className="font-semibold text-gray-100 mb-5 flex items-center gap-2.5">
      <span className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg tracking-wide">
        STEP {number}
      </span>
      <span className="text-base">{title}</span>
      {optional && <span className="text-gray-600 font-normal text-sm">(선택)</span>}
    </h2>
  )
}

// ─── PanelCard ────────────────────────────────────────────────────────────────

function PanelCard({
  panel, index, styleDescription, active, onDone, onImageReady,
}: {
  panel: Panel
  index: number
  styleDescription: string
  active: boolean
  onDone: (success: boolean) => void
  onImageReady: (url: string) => void
}) {
  const [status, setStatus] = useState<ImgStatus>('idle')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const retriesRef = useRef(0)
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone
  const onImageReadyRef = useRef(onImageReady); onImageReadyRef.current = onImageReady

  const fetchImage = useCallback(async () => {
    try {
      const prompt = `${panel.imagePrompt}, ${styleDescription}, cinematic composition, high quality`
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '이미지 생성 실패')
      setImageUrl(data.url)
      setStatus('loaded')
      onImageReadyRef.current(data.url)
      onDoneRef.current(true)
    } catch {
      if (retriesRef.current < 3) {
        retriesRef.current++
        setTimeout(fetchImage, 2000)
      } else {
        setStatus('failed')
        onDoneRef.current(false)
      }
    }
  }, [panel.imagePrompt, styleDescription])

  useEffect(() => {
    if (active && status === 'idle') { setStatus('loading'); fetchImage() }
  }, [active, status, fetchImage])

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-indigo-800 transition-colors">
      <div className="px-4 pt-4 pb-2 flex items-start gap-3">
        <span className="text-2xl font-black text-indigo-400 leading-none">
          #{String(index + 1).padStart(2, '0')}
        </span>
        <span className="font-semibold text-gray-100 mt-0.5">{panel.caption}</span>
      </div>
      <div className="relative bg-gray-950" style={{ aspectRatio: '16/9' }}>
        {imageUrl && status === 'loaded' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={panel.caption}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}
        {(status === 'idle' || status === 'loading') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
            <div className="spinner" />
            <p className="text-gray-400 text-xs">이미지 생성 중...</p>
          </div>
        )}
        {status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900/90 z-10">
            <p className="text-gray-400 text-sm">이미지 생성 실패</p>
            <button
              onClick={() => { retriesRef.current = 0; setStatus('loading'); fetchImage() }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {panel.dialogue && (
          <p className="text-gray-100 text-sm">
            <span className="text-indigo-400 font-medium">대사  </span>
            {panel.dialogue}
          </p>
        )}
        <p className="text-gray-400 text-xs">
          <span className="text-gray-500 font-medium">지문  </span>
          {panel.stageDirection}
        </p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  // ── STEP 01 state
  const [requestText, setRequestText] = useState('')
  const [step1Files, setStep1Files] = useState<File[]>([])
  const step1FileRef = useRef<HTMLInputElement>(null)

  // ── STEP 02 state
  const [activeTab2, setActiveTab2] = useState(0)
  const [selectedSize, setSelectedSize] = useState('1080×1920')
  const [customSize, setCustomSize] = useState('')
  const [selectedContentType, setSelectedContentType] = useState('')
  const [customContentType, setCustomContentType] = useState('')
  const [selectedContentForm, setSelectedContentForm] = useState('')
  const [customContentForm, setCustomContentForm] = useState('')

  // ── STEP 03 state
  const [refLinks, setRefLinks] = useState<RefLink[]>([
    { id: 1, url: '' }, { id: 2, url: '' }, { id: 3, url: '' },
  ])
  const [refFiles, setRefFiles] = useState<File[]>([])
  const step3FileRef = useRef<HTMLInputElement>(null)

  // ── STEP 04 state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [scenarioStarted, setScenarioStarted] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── STEP 05 state
  const [finalScenario, setFinalScenario] = useState('')
  const [panelCount, setPanelCount] = useState<10 | 20>(10)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [loadedCount, setLoadedCount] = useState(0)
  const [activePanels, setActivePanels] = useState<Set<number>>(new Set())
  const [panelImageUrls, setPanelImageUrls] = useState<Record<number, string>>({})
  const [isDownloading, setIsDownloading] = useState(false)

  const activeCountRef = useRef(0)
  const nextToActivateRef = useRef(0)

  // 채팅 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // 이미지 큐
  const activateNext = useCallback((total: number) => {
    while (activeCountRef.current < 2 && nextToActivateRef.current < total) {
      const idx = nextToActivateRef.current++
      activeCountRef.current++
      setActivePanels((prev) => new Set([...prev, idx]))
    }
  }, [])

  useEffect(() => {
    if (result) {
      setActivePanels(new Set())
      activeCountRef.current = 0
      nextToActivateRef.current = 0
      setLoadedCount(0)
      setPanelImageUrls({})
      activateNext(result.panels.length)
    }
  }, [result, activateNext])

  const handlePanelDone = useCallback(
    (index: number, success: boolean) => {
      void index
      activeCountRef.current = Math.max(0, activeCountRef.current - 1)
      if (success) setLoadedCount((c) => c + 1)
      if (result) activateNext(result.panels.length)
    },
    [result, activateNext],
  )

  const handleImageReady = useCallback((index: number, url: string) => {
    setPanelImageUrls((prev) => ({ ...prev, [index]: url }))
  }, [])

  // 컨텍스트 빌드 (Steps 1-3 데이터 수집)
  const buildContext = useCallback(async () => {
    const size = selectedSize === '직접 입력' ? customSize : selectedSize
    const contentType = selectedContentType === '기타' ? customContentType : selectedContentType
    const contentForm = selectedContentForm === '기타' ? customContentForm : selectedContentForm
    const activeLinks = refLinks.map((l) => l.url).filter((u) => u.trim())

    // 레퍼런스 이미지 파일 → base64
    const referenceImageBase64s: string[] = []
    for (const file of refFiles) {
      if (isImageFile(file)) {
        try {
          const b64 = await compressImageFile(file, 600)
          referenceImageBase64s.push(b64)
        } catch {
          // skip
        }
      }
    }

    return {
      requestText,
      fileNames: step1Files.map((f) => f.name),
      size,
      contentType,
      contentForm,
      referenceLinks: activeLinks,
      referenceImageBase64s,
    }
  }, [
    requestText, step1Files, selectedSize, customSize,
    selectedContentType, customContentType, selectedContentForm, customContentForm,
    refLinks, refFiles,
  ])

  // STEP 04: 시나리오 최초 생성
  const handleStartScenario = async () => {
    setChatLoading(true)
    setScenarioStarted(true)

    const context = await buildContext()
    const initialMsg: ChatMsg = {
      role: 'user',
      content:
        '위 광고주 요청 정보를 바탕으로 영상 스토리보드 시나리오를 제안해주세요. 씬 번호와 함께 각 씬의 화면 설명, 카메라 워크, 분위기, 핵심 메시지를 포함해서 상세하게 작성해주세요.',
    }

    const newMessages: ChatMsg[] = [initialMsg]
    setChatMessages(newMessages)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context, isInitial: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI 응답 실패')
      const aiMsg: ChatMsg = { role: 'assistant', content: data.message }
      const updated = [...newMessages, aiMsg]
      setChatMessages(updated)
      setFinalScenario(data.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '오류 발생'
      setChatMessages([...newMessages, { role: 'assistant', content: `⚠️ ${msg}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // STEP 04: 채팅 메시지 전송
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg: ChatMsg = { role: 'user', content: chatInput }
    const updated: ChatMsg[] = [...chatMessages, userMsg]
    setChatMessages(updated)
    setChatInput('')
    setChatLoading(true)

    const context = await buildContext()
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, context }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI 응답 실패')
      const aiMsg: ChatMsg = { role: 'assistant', content: data.message }
      const final = [...updated, aiMsg]
      setChatMessages(final)
      setFinalScenario(data.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '오류 발생'
      setChatMessages([...updated, { role: 'assistant', content: `⚠️ ${msg}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // STEP 05: 스토리보드 이미지 생성
  const handleGenerateImages = async () => {
    if (!finalScenario.trim()) return
    setIsGenerating(true)
    setGenerateError(null)
    setResult(null)

    const size = selectedSize === '직접 입력' ? customSize : selectedSize
    const contentType = selectedContentType === '기타' ? customContentType : selectedContentType
    const contentForm = selectedContentForm === '기타' ? customContentForm : selectedContentForm
    const mood = [size, contentType, contentForm].filter(Boolean).join(', ')

    const formData = new FormData()
    formData.append('narrative', finalScenario)
    formData.append('panelCount', panelCount.toString())
    formData.append('mood', mood)

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '생성에 실패했습니다.')
      setResult(data)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  // ZIP 다운로드
  const handleDownload = async () => {
    if (!result) return
    setIsDownloading(true)
    try {
      const zip = new JSZip()
      const folder = zip.folder('storyboard')!
      await Promise.all(
        result.panels.map(async (panel, i) => {
          const url = panelImageUrls[i]
          if (!url) return
          try {
            const res = await fetch(url)
            const blob = await res.blob()
            folder.file(`${String(i + 1).padStart(2, '0')}_${panel.caption}.jpg`, blob)
          } catch {
            // skip
          }
        }),
      )
      const content = await zip.generateAsync({ type: 'blob' })
      saveAs(content, 'storyboard.zip')
    } finally {
      setIsDownloading(false)
    }
  }

  const totalPanels = result?.panels.length ?? 0
  const progressPct = totalPanels > 0 ? Math.round((loadedCount / totalPanels) * 100) : 0

  // 최신 AI 메시지 가져오기
  const getLastAiMessage = () =>
    [...chatMessages].reverse().find((m) => m.role === 'assistant')?.content ?? ''

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-indigo-400">스토리보드 생성기</h1>
          <p className="text-gray-500 text-xs mt-0.5">AI 기반 광고 콘텐츠 스토리보드 자동 생성</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-5">

        {/* ═══════════════════════════════════════════════════
            STEP 01 — 광고주 요청사항
        ═══════════════════════════════════════════════════ */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <StepHeader number="01" title="광고주 요청사항" />

          {/* 파일 업로드 */}
          <div
            className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500 transition-colors mb-4"
            onClick={() => step1FileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const files = Array.from(e.dataTransfer.files)
              setStep1Files((prev) => [...prev, ...files])
            }}
          >
            <svg className="w-10 h-10 mx-auto text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-400 text-sm">클릭하거나 파일을 드래그해서 업로드</p>
            <p className="text-gray-600 text-xs mt-1">PPT · Excel · Word · PDF · 이미지 등 다양한 파일 지원</p>
          </div>
          <input
            ref={step1FileRef}
            type="file"
            multiple
            accept=".ppt,.pptx,.xls,.xlsx,.doc,.docx,.pdf,image/*,.key,.pages"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              setStep1Files((prev) => [...prev, ...files])
              e.target.value = ''
            }}
          />

          {/* 업로드된 파일 목록 */}
          {step1Files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {step1Files.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300">
                  <span className="text-base">📎</span>
                  <span className="max-w-[180px] truncate text-xs">{file.name}</span>
                  <button
                    onClick={() => setStep1Files((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-500 hover:text-red-400 ml-1 transition-colors text-base leading-none"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* 텍스트 입력 */}
          <textarea
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            placeholder="광고주 요청사항을 직접 입력하거나 파일 내용을 보완 설명해주세요.&#10;&#10;예시: 신제품 출시 기념 브랜드 영상 제작. 타겟은 2030 여성, 감성적이고 트렌디한 분위기로 제품의 혁신성을 강조..."
            rows={5}
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors text-sm"
          />
        </section>

        {/* ═══════════════════════════════════════════════════
            STEP 02 — 콘텐츠 포맷 선택
        ═══════════════════════════════════════════════════ */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <StepHeader number="02" title="콘텐츠 포맷 선택" optional />

          {/* 탭 */}
          <div className="flex gap-1 bg-gray-950 rounded-xl p-1 mb-5">
            {['① 제작물 사이즈', '② 제작물 유형', '③ 콘텐츠 형식'].map((tab, i) => (
              <button
                key={i}
                onClick={() => setActiveTab2(i)}
                className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  activeTab2 === i
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 탭 0: 사이즈 */}
          {activeTab2 === 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSize(s)}
                    className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                      selectedSize === s
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {selectedSize === '직접 입력' && (
                <input
                  type="text"
                  value={customSize}
                  onChange={(e) => setCustomSize(e.target.value)}
                  placeholder="예: 1280×720"
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                />
              )}
            </div>
          )}

          {/* 탭 1: 제작물 유형 */}
          {activeTab2 === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CONTENT_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedContentType(t)}
                    className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                      selectedContentType === t
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {selectedContentType === '기타' && (
                <input
                  type="text"
                  value={customContentType}
                  onChange={(e) => setCustomContentType(e.target.value)}
                  placeholder="제작물 유형을 직접 입력해주세요"
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                />
              )}
            </div>
          )}

          {/* 탭 2: 콘텐츠 형식 */}
          {activeTab2 === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CONTENT_FORMS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setSelectedContentForm(f)}
                    className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                      selectedContentForm === f
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-700'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {selectedContentForm === '기타' && (
                <input
                  type="text"
                  value={customContentForm}
                  onChange={(e) => setCustomContentForm(e.target.value)}
                  placeholder="콘텐츠 형식을 직접 입력해주세요"
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                />
              )}
            </div>
          )}

          {/* 선택 요약 */}
          {(selectedSize || selectedContentType || selectedContentForm) && (
            <div className="mt-4 pt-4 border-t border-gray-800 flex flex-wrap gap-2">
              {[
                selectedSize !== '직접 입력' ? selectedSize : customSize,
                selectedContentType !== '기타' ? selectedContentType : customContentType,
                selectedContentForm !== '기타' ? selectedContentForm : customContentForm,
              ]
                .filter(Boolean)
                .map((item, i) => (
                  <span key={i} className="bg-indigo-950/50 text-indigo-300 border border-indigo-900/50 px-3 py-1 rounded-full text-xs">
                    {item}
                  </span>
                ))}
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════
            STEP 03 — 톤앤매너 레퍼런스
        ═══════════════════════════════════════════════════ */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <StepHeader number="03" title="톤앤매너 레퍼런스" optional />

          {/* 레퍼런스 링크 */}
          <p className="text-gray-400 text-sm font-medium mb-3">레퍼런스 링크</p>
          <div className="space-y-2 mb-2">
            {refLinks.map((link) => (
              <div key={link.id} className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 bg-gray-950 border border-gray-700 rounded-xl px-3 py-2.5 focus-within:border-indigo-500 transition-colors">
                  <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <input
                    type="url"
                    value={link.url}
                    onChange={(e) =>
                      setRefLinks((prev) =>
                        prev.map((l) => (l.id === link.id ? { ...l, url: e.target.value } : l)),
                      )
                    }
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1 bg-transparent text-gray-100 placeholder-gray-600 text-sm outline-none"
                  />
                </div>
                {refLinks.length > 1 && (
                  <button
                    onClick={() => setRefLinks((prev) => prev.filter((l) => l.id !== link.id))}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xl leading-none w-8 flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setRefLinks((prev) => [...prev, { id: Date.now(), url: '' }])}
            className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors mb-6 flex items-center gap-1"
          >
            <span className="text-lg leading-none">+</span> 링크 추가
          </button>

          {/* 레퍼런스 파일 업로드 */}
          <p className="text-gray-400 text-sm font-medium mb-3">레퍼런스 파일 업로드</p>
          <div
            className="border-2 border-dashed border-gray-700 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-500 transition-colors"
            onClick={() => step3FileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const files = Array.from(e.dataTransfer.files)
              setRefFiles((prev) => [...prev, ...files])
            }}
          >
            <svg className="w-8 h-8 mx-auto text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400 text-sm">이미지 · 영상 파일을 여러 개 한 번에 업로드</p>
            <p className="text-gray-600 text-xs mt-1">이미지 파일은 AI가 직접 분석합니다</p>
          </div>
          <input
            ref={step3FileRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              setRefFiles((prev) => [...prev, ...files])
              e.target.value = ''
            }}
          />
          {refFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {refFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-300">
                  <span>{isImageFile(file) ? '🖼' : '🎬'}</span>
                  <span className="max-w-[140px] truncate">{file.name}</span>
                  <button
                    onClick={() => setRefFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-500 hover:text-red-400 ml-1 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════
            STEP 04 — AI 시나리오 생성 & 대화
        ═══════════════════════════════════════════════════ */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <StepHeader number="04" title="AI 시나리오 생성" />
          <p className="text-gray-500 text-sm mb-5">
            STEP 01~03의 정보를 바탕으로 AI가 시나리오를 생성합니다.
            대화를 통해 함께 수정하고 발전시켜 나갈 수 있어요.
          </p>

          {!scenarioStarted ? (
            <button
              onClick={handleStartScenario}
              disabled={!requestText.trim() && step1Files.length === 0}
              className="w-full py-4 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-all text-base"
            >
              ✨ 시나리오 생성하기
            </button>
          ) : (
            <div className="space-y-3">
              {/* 채팅 메시지 영역 */}
              <div className="bg-gray-950 rounded-xl p-4 h-[460px] overflow-y-auto space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-1">
                        AI
                      </div>
                    )}
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-sm'
                          : 'bg-gray-800 text-gray-100 rounded-tl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* 로딩 인디케이터 */}
                {chatLoading && (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      AI
                    </div>
                    <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1 items-center">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* 채팅 입력 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      handleSendChat()
                    }
                  }}
                  placeholder="시나리오 수정 요청이나 추가 의견을 입력하세요..."
                  disabled={chatLoading}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors text-sm disabled:opacity-50"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-xl transition-colors flex-shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════
            STEP 05 — 이미지 생성
        ═══════════════════════════════════════════════════ */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <StepHeader number="05" title="스토리보드 이미지 생성" />
          <p className="text-gray-500 text-sm mb-4">
            STEP 04에서 완성한 시나리오로 이미지를 생성합니다. 직접 수정하거나 붙여넣기도 가능해요.
          </p>

          {/* 시나리오 입력 */}
          <div className="flex items-center justify-between mb-2">
            <label className="text-gray-300 text-sm font-medium">최종 시나리오</label>
            {chatMessages.length > 0 && (
              <button
                onClick={() => {
                  const last = getLastAiMessage()
                  if (last) setFinalScenario(last)
                }}
                className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors flex items-center gap-1"
              >
                ↑ STEP 04에서 가져오기
              </button>
            )}
          </div>
          <textarea
            value={finalScenario}
            onChange={(e) => setFinalScenario(e.target.value)}
            placeholder="STEP 04에서 완성한 시나리오를 붙여넣거나, 위 버튼으로 가져오세요.&#10;또는 여기에 직접 시나리오를 작성해도 됩니다."
            rows={8}
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors text-sm mb-4"
          />

          {/* 패널 수 선택 */}
          <div className="flex items-center gap-3 mb-4">
            <p className="text-gray-500 text-sm mr-auto">패널 수</p>
            {([10, 20] as const).map((n) => (
              <button
                key={n}
                onClick={() => setPanelCount(n)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  panelCount === n
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {n}장
              </button>
            ))}
          </div>

          {/* 비용 안내 */}
          <div className="bg-indigo-950/30 border border-indigo-900/50 rounded-xl px-4 py-3 text-indigo-300 text-xs mb-4">
            💡 gpt-image-1 이미지 생성 비용: 장당 약 $0.04~0.08 · 10장 ≈ $0.40~0.80
          </div>

          {/* 에러 */}
          {generateError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm mb-4">
              {generateError}
            </div>
          )}

          {/* 생성 버튼 */}
          <button
            onClick={handleGenerateImages}
            disabled={!finalScenario.trim() || isGenerating}
            className="w-full py-4 rounded-xl font-semibold text-base transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-3">
                <span className="spinner inline-block" style={{ width: '1.25rem', height: '1.25rem' }} />
                스토리보드 구성 중...
              </span>
            ) : (
              '스토리보드 이미지 생성하기'
            )}
          </button>
        </section>

        {/* ═══════════════════════════════════════════════════
            결과 — 스토리보드 그리드
        ═══════════════════════════════════════════════════ */}
        {result && (
          <section className="space-y-4">
            {/* 진행 바 */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-300 text-sm font-medium">
                  이미지 {loadedCount} / {totalPanels} 로드됨
                </span>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading || loadedCount === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
                >
                  {isDownloading ? (
                    <>
                      <span className="spinner inline-block" style={{ width: '1rem', height: '1rem' }} />
                      준비 중...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      ZIP 다운로드
                    </>
                  )}
                </button>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* 패널 그리드 */}
            <div className="grid grid-cols-2 gap-4">
              {result.panels.map((panel, i) => (
                <PanelCard
                  key={panel.id}
                  panel={panel}
                  index={i}
                  styleDescription={result.styleDescription}
                  active={activePanels.has(i)}
                  onDone={(s) => handlePanelDone(i, s)}
                  onImageReady={(url) => handleImageReady(i, url)}
                />
              ))}
            </div>
          </section>
        )}

        {/* 이용 안내 */}
        <section className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-5 text-gray-500 text-xs space-y-1.5">
          <p className="font-semibold text-gray-400 mb-2">이용 시 참고사항</p>
          <p>• 캐릭터·장소 일관성은 보장되지 않습니다.</p>
          <p>• 레퍼런스 이미지는 AI가 분석하여 프롬프트에 반영하지만 완벽한 재현은 어렵습니다.</p>
          <p>• 이미지 생성 비용은 OpenAI 계정에서 차감됩니다.</p>
          <p>• 상업적 이용 전 OpenAI 이용 약관을 확인하세요.</p>
        </section>
      </main>
    </div>
  )
}
