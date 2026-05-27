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

type ImgStatus = 'idle' | 'loading' | 'loaded' | 'failed'

// ─── Utilities ────────────────────────────────────────────────────────────────

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.width
      let h = img.height
      if (w > 800 || h > 800) {
        if (w > h) { h = Math.round((h * 800) / w); w = 800 }
        else { w = Math.round((w * 800) / h); h = 800 }
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

const MOOD_PRESETS = [
  '따뜻한 가족 드라마',
  '공포 스릴러',
  '밝고 경쾌한 광고',
  '감성 뮤직비디오',
  '다큐멘터리',
  '액션 블록버스터',
  '로맨스',
  '코미디',
]

// ─── ImageSlot ────────────────────────────────────────────────────────────────

function ImageSlot({
  image,
  onUpload,
  onRemove,
}: {
  image: string | null
  onUpload: (f: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className="relative rounded-lg overflow-hidden border-2 border-dashed border-gray-700 bg-gray-900 flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-colors"
      style={{ aspectRatio: '4/3' }}
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="참조 이미지" className="w-full h-full object-cover" />
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600 transition-colors z-10"
          >
            ×
          </button>
        </>
      ) : (
        <div
          className="flex flex-col items-center gap-1 text-gray-500"
          onClick={() => inputRef.current?.click()}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-xs">이미지 추가</span>
          <span className="text-xs text-gray-600">JPG · PNG · WEBP</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── PanelCard ────────────────────────────────────────────────────────────────

function PanelCard({
  panel,
  index,
  styleDescription,
  active,
  onDone,
  onImageReady,
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
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const onImageReadyRef = useRef(onImageReady)
  onImageReadyRef.current = onImageReady

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
    if (active && status === 'idle') {
      setStatus('loading')
      fetchImage()
    }
  }, [active, status, fetchImage])

  const handleManualRetry = () => {
    retriesRef.current = 0
    setStatus('loading')
    fetchImage()
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-indigo-800 transition-colors">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start gap-3">
        <span className="text-2xl font-black text-indigo-400 leading-none">
          #{String(index + 1).padStart(2, '0')}
        </span>
        <span className="font-semibold text-gray-100 mt-0.5">{panel.caption}</span>
      </div>

      {/* Image */}
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
              onClick={handleManualRetry}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>

      {/* Text */}
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [images, setImages] = useState<(string | null)[]>([null, null, null])
  const [narrative, setNarrative] = useState('')
  const [panelCount, setPanelCount] = useState<10 | 20>(10)
  const [mood, setMood] = useState('')
  const [customMood, setCustomMood] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [loadedCount, setLoadedCount] = useState(0)
  const [activePanels, setActivePanels] = useState<Set<number>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const [panelImageUrls, setPanelImageUrls] = useState<Record<number, string>>({})

  const activeCountRef = useRef(0)
  const nextToActivateRef = useRef(0)

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

  const handleImageUpload = async (index: number, file: File) => {
    const compressed = await compressImage(file)
    setImages((prev) => {
      const next = [...prev]
      next[index] = compressed
      return next
    })
  }

  const handleGenerate = async () => {
    if (!narrative.trim()) return
    setIsGenerating(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('narrative', narrative)
    formData.append('mood', mood || customMood)
    formData.append('panelCount', panelCount.toString())

    images.forEach((img, i) => {
      if (img) {
        const arr = img.split(',')
        const mime = arr[0].match(/:(.*?);/)![1]
        const bstr = atob(arr[1])
        let n = bstr.length
        const u8arr = new Uint8Array(n)
        while (n--) u8arr[n] = bstr.charCodeAt(n)
        formData.append(`image_${i}`, new Blob([u8arr], { type: mime }), `ref_${i}.jpg`)
      }
    })

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '생성에 실패했습니다.')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

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
            // skip failed images
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

  return (
    <div className="min-h-screen">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-indigo-400">스토리보드 생성기</h1>
          <p className="text-gray-500 text-xs mt-0.5">AI로 시나리오를 시각적 스토리보드로 변환 (DALL·E 3)</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* STEP 1 */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-100 mb-4">
            <span className="text-indigo-400 mr-2">STEP 1</span>
            참조 이미지 업로드
            <span className="text-gray-600 font-normal text-sm ml-2">(선택)</span>
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <ImageSlot
                key={i}
                image={images[i]}
                onUpload={(f) => handleImageUpload(i, f)}
                onRemove={() =>
                  setImages((prev) => { const next = [...prev]; next[i] = null; return next })
                }
              />
            ))}
          </div>
          <p className="text-gray-600 text-xs mt-3">
            스타일·톤 참조용 · 최대 3개 · JPG, PNG, WEBP · 800px 초과 시 자동 압축
          </p>
        </section>

        {/* STEP 2 */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-100 mb-4">
            <span className="text-indigo-400 mr-2">STEP 2</span>
            시나리오 입력
          </h2>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="스토리보드로 만들 시나리오를 입력해주세요.&#10;장면 묘사, 인물, 감정 흐름 등을 자세히 적을수록 좋습니다."
            rows={6}
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors text-sm"
          />
          <div className="flex items-center gap-3 mt-4">
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
        </section>

        {/* STEP 3 */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-100 mb-4">
            <span className="text-indigo-400 mr-2">STEP 3</span>
            영상 분위기 / 용도
            <span className="text-gray-600 font-normal text-sm ml-2">(선택)</span>
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {MOOD_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => { setMood((p) => (p === preset ? '' : preset)); setCustomMood('') }}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  mood === preset
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={customMood}
            onChange={(e) => { setCustomMood(e.target.value); setMood('') }}
            placeholder="직접 입력 (예: 80년대 홍콩 느와르)"
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
          />
        </section>

        {/* 비용 안내 */}
        <div className="bg-indigo-950/30 border border-indigo-900/50 rounded-xl px-4 py-3 text-indigo-300 text-xs">
          💡 DALL·E 3 이미지 생성 비용: 장당 약 $0.08 (10장 ≈ $0.80 / 20장 ≈ $1.60)
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!narrative.trim() || isGenerating}
          className="w-full py-4 rounded-xl font-semibold text-base transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-3">
              <span className="spinner inline-block" style={{ width: '1.25rem', height: '1.25rem' }} />
              AI가 스토리보드를 구성하는 중...
            </span>
          ) : (
            '스토리보드 생성하기'
          )}
        </button>

        {/* Results */}
        {result && (
          <section className="space-y-4">
            {/* Progress Bar */}
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
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

            {/* Panel Grid */}
            <div className="grid grid-cols-2 gap-4">
              {result.panels.map((panel, i) => (
                <PanelCard
                  key={panel.id}
                  panel={panel}
                  index={i}
                  styleDescription={result.styleDescription}
                  active={activePanels.has(i)}
                  onDone={(success) => handlePanelDone(i, success)}
                  onImageReady={(url) => handleImageReady(i, url)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Limitations */}
        <section className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-5 text-gray-500 text-xs space-y-1.5">
          <p className="font-semibold text-gray-400 mb-2">이용 시 참고사항</p>
          <p>• 캐릭터 일관성은 보장되지 않습니다.</p>
          <p>• 참조 이미지는 텍스트 프롬프트로만 반영되며 완벽한 스타일 재현은 어렵습니다.</p>
          <p>• DALL·E 3 이미지 URL은 1시간 후 만료됩니다. 다운로드는 생성 직후 해주세요.</p>
          <p>• 이미지 생성 비용은 OpenAI 계정에서 차감됩니다.</p>
        </section>
      </main>
    </div>
  )
}
