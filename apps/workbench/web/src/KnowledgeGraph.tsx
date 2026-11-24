import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'

/**
 * What a person understands, drawn as the notebook it is: the material's sections are headings marked with a
 * highlighter, each with the understanding learned from it gathered around; ink for what the person confirmed,
 * a dashed pencil ring for what waits on them, red for an open contradiction. The lines between items say how one
 * bears on another: supports, contradicts, was revised into.
 *
 * Wheel to zoom, drag the background to pan, drag an item to move it (the rest follow), click to open it. Pointing
 * at an item brings what it is tied to forward. The structure view says all of the same in words, so the drawing is
 * never the only way to reach anything.
 */

export type ItemState = 'held' | 'pending' | 'conflict' | 'challenged' | 'past'

export interface GraphItem {
  readonly id: string
  readonly label: string
  readonly state: ItemState
  /** `item` is an understanding; `topic` a section of a material; `material` the material itself. */
  readonly kind?: 'item' | 'topic' | 'material'
  /** Drawn stronger: it belongs to what is open, rather than standing beside it. */
  readonly focus?: boolean
  /** An item waiting on the person: opening it means deciding on it, not reading its page. */
  readonly pending?: boolean
}

export interface GraphEdge {
  readonly from: string
  readonly to: string
  /**
   * `supports`, `contradicts`, `evolves_to`, `forks_from`; `pending` for a relation still waiting on the person;
   * `belongs` from an item to the section it was learned from; `part` from a section to its material.
   */
  readonly type: string
}

interface Point extends SimulationNodeDatum {
  readonly item: GraphItem
  readonly lines: readonly string[]
  readonly labelWidth: number
  /** How many relations meet here: an item many others bear on is drawn larger. */
  readonly degree: number
}

type Link = SimulationLinkDatum<Point> & {
  readonly type: string
  readonly source: Point
  readonly target: Point
}

const MIN_SCALE = 0.3
const MAX_SCALE = 3
const LABEL_STEP = 15
const ARROWED = new Set(['evolves_to', 'forks_from', 'forks'])
const STRUCTURAL = new Set(['belongs', 'part'])

const kindOf = (item: GraphItem): 'item' | 'topic' | 'material' => item.kind ?? 'item'

/** Roughly how wide a label is drawn: Chinese characters take a full em, Latin about half. */
function labelWidth(label: string, size: number): number {
  let width = 0
  for (const char of label) width += char.charCodeAt(0) > 0x2e80 ? size : size * 0.55
  return width
}

function labelLines(label: string): readonly string[] {
  const chars = Array.from(label)
  const first = chars.slice(0, 16).join('')
  if (chars.length <= 16) return [first]
  return [first, chars.length > 32 ? `${chars.slice(16, 31).join('')}…` : chars.slice(16).join('')]
}

function GraphLabel(props: {
  readonly lines: readonly string[]
  readonly x: number
  readonly y: number
}) {
  const {
    lines: [first, second],
    x,
    y,
  } = props
  return (
    <text x={x} y={y} textAnchor="middle">
      {first}
      {second !== undefined && (
        <tspan x={x} dy={LABEL_STEP}>
          {second}
        </tspan>
      )}
    </text>
  )
}

function radiusOf(point: Point): number {
  if (kindOf(point.item) !== 'item') return 0
  return Math.min(14, 8 + point.degree * 1.6) + (point.item.focus === true ? 1 : 0)
}

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** A gentle bow, so lines that meet at an item can be told apart and the drawing reads as hand-made. */
function arc(source: Point, target: Point, bend: number): string {
  const x1 = source.x ?? 0
  const y1 = source.y ?? 0
  const x2 = target.x ?? 0
  const y2 = target.y ?? 0
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend
  const my = (y1 + y2) / 2 + (x2 - x1) * bend
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`
}

export function KnowledgeGraph(props: {
  readonly items: readonly GraphItem[]
  readonly edges: readonly GraphEdge[]
  /** A fixed height, or none to fill the space it is given. */
  readonly height?: number
  readonly selected?: string | undefined
  readonly onSelect: (item: GraphItem) => void
}) {
  const { items, edges } = props
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 360, height: props.height ?? 320 })
  const { width, height } = size
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string>()
  const [focused, setFocused] = useState<string>()
  const highlighted = hovered ?? focused
  const [, setFrame] = useState(0)
  const simulation = useRef<Simulation<Point, Link> | undefined>(undefined)
  /** Where each item was, so a change to the understanding does not throw the whole drawing around. */
  const placed = useRef(new Map<string, { x: number; y: number }>())
  /** Whether the person has panned or zoomed: from then on the drawing stays where they put it. */
  const touched = useRef(false)
  const easing = useRef(0)

  useEffect(() => {
    const element = box.current
    if (element === null) return undefined
    const measure = (): void =>
      setSize({
        width: Math.max(200, Math.round(element.clientWidth)),
        height: props.height ?? Math.max(240, Math.round(element.clientHeight)),
      })
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [props.height])

  const { points, links } = useMemo(() => {
    const degree = new Map<string, number>()
    for (const edge of edges) {
      if (STRUCTURAL.has(edge.type)) continue
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
    }
    const points: Point[] = items.map((item) => {
      const was = placed.current.get(item.id)
      const lines = labelLines(item.label)
      const at = {
        item,
        lines,
        labelWidth: Math.max(
          ...lines.map((line) => labelWidth(line, item.kind === 'material' ? 13 : 12)),
        ),
        degree: degree.get(item.id) ?? 0,
      }
      return was === undefined ? at : { ...at, x: was.x, y: was.y }
    })
    // Ends as the points themselves, so the first drawing, before the layout starts, already has them.
    const byId = new Map(points.map((point) => [point.item.id, point]))
    const links: Link[] = edges.flatMap((edge) => {
      const source = byId.get(edge.from)
      const target = byId.get(edge.to)
      return source === undefined || target === undefined || source === target
        ? []
        : [{ source, target, type: edge.type }]
    })
    return { points, links }
  }, [items, edges])
  const sparse = points.length <= 5

  /** Frames everything, until the person has moved or zoomed the drawing themselves. */
  const fit = useRef<() => void>(() => undefined)
  fit.current = (): void => {
    if (touched.current || points.length === 0) return
    const bounds = points.map((point) => {
      const x = point.x ?? width / 2
      const y = point.y ?? height / 2
      const r = radiusOf(point)
      const extraLine = (point.lines.length - 1) * LABEL_STEP
      const hub = kindOf(point.item) !== 'item'
      const half = Math.max(20, r + 8, point.labelWidth / 2 + 8)
      const above = hub ? 11 + extraLine / 2 : Math.max(20, r + 8)
      const below = hub ? above : r + 19 + extraLine
      return {
        left: x - half,
        right: x + half,
        top: y - above,
        bottom: y + below,
      }
    })
    const left = Math.min(...bounds.map((bound) => bound.left))
    const right = Math.max(...bounds.map((bound) => bound.right))
    const top = Math.min(...bounds.map((bound) => bound.top))
    const bottom = Math.max(...bounds.map((bound) => bound.bottom))
    const k = Math.min(
      1.25,
      Math.max(MIN_SCALE, Math.min((width - 32) / (right - left), (height - 48) / (bottom - top))),
    )
    setView({
      k,
      x: width / 2 - ((left + right) / 2) * k,
      y: height / 2 - ((top + bottom) / 2) * k,
    })
  }

  useEffect(() => {
    const sim = forceSimulation(points)
      .force(
        'charge',
        forceManyBody<Point>().strength((point) =>
          kindOf(point.item) === 'item' ? -190 : kindOf(point.item) === 'topic' ? -460 : -640,
        ),
      )
      .force(
        'link',
        forceLink<Point, Link>(links)
          .distance((link) =>
            link.type === 'belongs'
              ? 54
              : link.type === 'part'
                ? 120
                : link.type === 'evolves_to'
                  ? 70
                  : 110,
          )
          .strength((link) => (link.type === 'belongs' ? 0.7 : link.type === 'part' ? 0.4 : 0.25)),
      )
      // A gentle pull to the middle, so an item tied to nothing stays in view instead of drifting off.
      .force('x', forceX<Point>(width / 2).strength(0.05))
      .force('y', forceY<Point>(height / 2).strength(0.07))
      .force(
        'collide',
        forceCollide<Point>((point) =>
          kindOf(point.item) === 'item'
            ? Math.max(24, point.labelWidth / 2)
            : point.labelWidth / 2 + 12,
        ),
      )
    simulation.current = sim
    let frame = 0
    const keep = (): void => {
      for (const point of points) {
        if (point.x !== undefined && point.y !== undefined) {
          placed.current.set(point.item.id, { x: point.x, y: point.y })
        }
      }
    }
    if (prefersReducedMotion() || sparse) {
      sim.stop().tick(300)
      keep()
      fit.current()
      setFrame((count) => count + 1)
    }
    sim.on('tick', () => {
      keep()
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0
          // The frame follows the layout as it settles, so nothing is ever drawn out of view.
          fit.current()
          setFrame((count) => count + 1)
        })
      }
    })
    return () => {
      sim.stop()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [points, links, sparse, width, height])

  /** From a pointer on the screen to the drawing's own coordinates. */
  const toGraph = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = box.current?.getBoundingClientRect()
    return {
      x: (clientX - (rect?.left ?? 0) - view.x) / view.k,
      y: (clientY - (rect?.top ?? 0) - view.y) / view.k,
    }
  }

  const zoomTo = (factor: number, clientX?: number, clientY?: number, smooth = false): void => {
    touched.current = true
    const rect = box.current?.getBoundingClientRect()
    const px = clientX === undefined ? width / 2 : clientX - (rect?.left ?? 0)
    const py = clientY === undefined ? height / 2 : clientY - (rect?.top ?? 0)
    const from = view
    const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, from.k * factor))
    // The point under the pointer stays under it.
    const to = { k, x: px - ((px - from.x) / from.k) * k, y: py - ((py - from.y) / from.k) * k }
    cancelAnimationFrame(easing.current)
    if (!smooth || prefersReducedMotion()) {
      setView(to)
      return
    }
    const start = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / 180)
      const e = 1 - (1 - t) ** 3
      setView({
        k: from.k + (to.k - from.k) * e,
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
      })
      if (t < 1) easing.current = requestAnimationFrame(step)
    }
    easing.current = requestAnimationFrame(step)
  }

  const wheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    zoomTo(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
  }

  // A wheel over the drawing zooms it instead of scrolling the pane under it.
  useEffect(() => {
    const element = box.current
    if (element === null) return undefined
    const hold = (event: globalThis.WheelEvent): void => event.preventDefault()
    element.addEventListener('wheel', hold, { passive: false })
    return () => element.removeEventListener('wheel', hold)
  }, [])

  const pan = (event: ReactPointerEvent<SVGRectElement>): void => {
    if (event.button !== 0) return
    touched.current = true
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const from = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }
    const move = (moved: PointerEvent): void => {
      setView((now) => ({
        ...now,
        x: from.vx + moved.clientX - from.x,
        y: from.vy + moved.clientY - from.y,
      }))
    }
    const stop = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', stop)
      target.removeEventListener('pointercancel', stop)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', stop)
    target.addEventListener('pointercancel', stop)
  }

  const drag = (event: ReactPointerEvent<SVGGElement>, point: Point): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const start = { x: event.clientX, y: event.clientY }
    let moved = false
    const move = (step: PointerEvent): void => {
      if (!moved && Math.hypot(step.clientX - start.x, step.clientY - start.y) < 4) return
      moved = true
      touched.current = true
      const at = toGraph(step.clientX, step.clientY)
      point.fx = at.x
      point.fy = at.y
      if (prefersReducedMotion()) {
        point.x = at.x
        point.y = at.y
        placed.current.set(point.item.id, at)
        setFrame((count) => count + 1)
      } else {
        simulation.current?.alphaTarget(0.3).restart()
      }
    }
    const stop = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', stop)
      target.removeEventListener('pointercancel', stop)
      point.fx = null
      point.fy = null
      simulation.current?.alphaTarget(0)
      if (!moved && kindOf(point.item) === 'item') props.onSelect(point.item)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', stop)
    target.addEventListener('pointercancel', stop)
  }

  const near = useMemo(() => {
    if (highlighted === undefined) return undefined
    const lit = new Set([highlighted])
    for (const link of links) {
      if (link.source.item.id === highlighted) lit.add(link.target.item.id)
      if (link.target.item.id === highlighted) lit.add(link.source.item.id)
    }
    return lit
  }, [highlighted, links])

  if (items.length === 0) return null
  const understood = items.filter((item) => kindOf(item) === 'item')
  const counts = understood.reduce<Record<ItemState, number>>(
    (sum, item) => ({ ...sum, [item.state]: sum[item.state] + 1 }),
    { held: 0, pending: 0, conflict: 0, challenged: 0, past: 0 },
  )
  const relations = links.filter((link) => !STRUCTURAL.has(link.type)).length
  // Leave the heading labels visible when a zoomed-out drawing is too dense to read all its words.
  const showLabels = understood.length <= 8 || view.k >= (width < 520 ? 1.8 : 0.7)
  const tooltip = items.find((item) => item.id === highlighted)?.label
  return (
    <figure className="map knowledge-graph" data-fill={props.height === undefined}>
      <div
        className="graph-canvas"
        ref={box}
        style={props.height === undefined ? undefined : { height: props.height }}
      >
        <svg
          width={width}
          height={height}
          role="group"
          aria-label={`理解图谱：${understood.length} 条理解，${relations} 条关系。结构视图里有同样的内容。`}
          onWheel={wheel}
        >
          <defs>
            <marker
              id="graph-arrow"
              viewBox="0 0 8 8"
              refX="19"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8 z" className="map-arrow" />
            </marker>
          </defs>
          <rect className="graph-ground" width={width} height={height} onPointerDown={pan} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {links.map((link, index) => {
              const lit =
                near === undefined ||
                (near.has(link.source.item.id) && near.has(link.target.item.id))
              const structural = STRUCTURAL.has(link.type)
              return (
                <path
                  key={`${link.source.item.id}-${link.type}-${link.target.item.id}`}
                  className={`map-edge map-${link.type}`}
                  data-dim={!lit}
                  data-lit={near !== undefined && lit && !structural}
                  d={arc(link.source, link.target, structural ? 0 : index % 2 === 0 ? 0.12 : -0.12)}
                  {...(ARROWED.has(link.type) ? { markerEnd: 'url(#graph-arrow)' } : {})}
                />
              )
            })}
            {points.map((point) => {
              const { item, lines } = point
              const kind = kindOf(item)
              const lit = near === undefined || near.has(item.id)
              const x = point.x ?? width / 2
              const y = point.y ?? height / 2
              if (kind !== 'item') {
                const w = point.labelWidth + 14
                const h = 22 + (lines.length - 1) * LABEL_STEP
                return (
                  <g
                    key={item.id}
                    className={`map-hub map-${kind}`}
                    role="img"
                    aria-label={item.label}
                    tabIndex={0}
                    data-dim={!lit}
                    // Headings on dense maps stay legible as the drawing zooms out.
                    transform={
                      !sparse && view.k < 1
                        ? `translate(${x} ${y}) scale(${Math.min(1 / view.k, 2.4)}) translate(${-x} ${-y})`
                        : undefined
                    }
                    onPointerDown={(event) => drag(event, point)}
                    onPointerEnter={() => setHovered(item.id)}
                    onPointerLeave={() => setHovered(undefined)}
                    onFocus={() => {
                      setHovered(undefined)
                      setFocused(item.id)
                    }}
                    onBlur={() => setFocused(undefined)}
                  >
                    <rect
                      x={x - w / 2}
                      y={y - h / 2}
                      width={w}
                      height={h}
                      rx={kind === 'material' ? 4 : 2}
                    />
                    <GraphLabel lines={lines} x={x} y={y - h / 2 + 15} />
                  </g>
                )
              }
              const r = radiusOf(point)
              const showing = showLabels || highlighted === item.id || item.id === props.selected
              return (
                <g
                  key={item.id}
                  className="map-node"
                  role="button"
                  aria-label={item.label}
                  tabIndex={0}
                  data-state={item.state}
                  data-dim={!lit}
                  data-hovered={highlighted === item.id}
                  data-selected={item.id === props.selected}
                  onPointerDown={(event) => drag(event, point)}
                  onPointerEnter={() => setHovered(item.id)}
                  onPointerLeave={() => setHovered(undefined)}
                  onFocus={() => {
                    setHovered(undefined)
                    setFocused(item.id)
                  }}
                  onBlur={() => setFocused(undefined)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      props.onSelect(item)
                    }
                  }}
                >
                  <circle className="map-hit" cx={x} cy={y} r={Math.max(20, r + 8)} />
                  <circle className="halo" cx={x} cy={y} r={r + 8} />
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    data-held={item.state !== 'past'}
                    data-conflict={item.state === 'conflict'}
                  />
                  {item.state === 'challenged' && (
                    <circle className="badge" cx={x + r * 0.75} cy={y - r * 0.75} r={3} />
                  )}
                  {showing && <GraphLabel lines={lines} x={x} y={y + r + 15} />}
                </g>
              )
            })}
          </g>
        </svg>
        {tooltip !== undefined && (
          <div className="graph-tooltip" role="tooltip">
            {tooltip}
          </div>
        )}
        <div className="graph-tools">
          <button
            type="button"
            className="tool"
            aria-label="放大"
            onClick={() => zoomTo(1.3, undefined, undefined, true)}
          >
            +
          </button>
          <button
            type="button"
            className="tool"
            aria-label="缩小"
            onClick={() => zoomTo(1 / 1.3, undefined, undefined, true)}
          >
            −
          </button>
          <button
            type="button"
            className="tool"
            aria-label="重新排列并全部显示"
            onClick={() => {
              touched.current = false
              const sim = simulation.current?.alpha(0.5)
              if (prefersReducedMotion()) {
                sim?.stop().tick(300)
                setFrame((count) => count + 1)
              } else {
                sim?.restart()
              }
              fit.current()
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <path
                d="M2.5 6V2.5H6M13.5 10v3.5H10M13.5 6V2.5H10M2.5 10v3.5H6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <figcaption className="graph-legend">
        <span data-state="held">已确认 {counts.held}</span>
        {counts.pending > 0 && <span data-state="pending">待确认 {counts.pending}</span>}
        {counts.conflict > 0 && <span data-state="conflict">有矛盾 {counts.conflict}</span>}
        {counts.challenged > 0 && <span data-state="challenged">被质疑 {counts.challenged}</span>}
        {counts.past > 0 && <span data-state="past">已放下 {counts.past}</span>}
        <span className="graph-edges">
          <i className="edge-supports" />
          支持
          <i className="edge-contradicts" />
          矛盾
          <i className="edge-evolves" />
          修正
        </span>
      </figcaption>
    </figure>
  )
}
