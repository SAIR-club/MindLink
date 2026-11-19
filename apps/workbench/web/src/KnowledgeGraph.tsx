import {
  forceCenter,
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
 * The understanding as a graph a person can move around in: what they hold, what waits on them, and how the items
 * bear on each other. Unlike a graph of notes, every edge says how one item bears on another (supports, contradicts,
 * was revised into) and every item says where it stands (held, waiting, contradicted, challenged, given up).
 *
 * Wheel to zoom, drag the background to pan, drag an item to move it, click to open it. Hovering an item lights up
 * what it is tied to. The tree beside it says all of the same in words, so the drawing itself is not the only way
 * to reach anything.
 */

export type ItemState = 'held' | 'pending' | 'conflict' | 'challenged' | 'past'

export interface GraphItem {
  readonly id: string
  readonly label: string
  readonly state: ItemState
  /** Drawn larger: it belongs to what is open, rather than standing beside it. */
  readonly focus?: boolean
  /** An item waiting on the person: opening it means deciding on it, not reading its page. */
  readonly pending?: boolean
}

export interface GraphEdge {
  readonly from: string
  readonly to: string
  /** `supports`, `contradicts`, `evolves_to`, `forks_from`; `pending` for a relation still waiting on the person. */
  readonly type: string
}

interface Point extends SimulationNodeDatum {
  readonly item: GraphItem
}

type Link = SimulationLinkDatum<Point> & { readonly type: string }

const MIN_SCALE = 0.35
const MAX_SCALE = 3
const ARROWED = new Set(['evolves_to', 'forks_from', 'forks'])

function shortened(label: string, scale: number): string {
  const room = scale >= 1.4 ? 22 : scale >= 0.9 ? 12 : 7
  return label.length > room ? `${label.slice(0, room)}…` : label
}

export function KnowledgeGraph(props: {
  readonly items: readonly GraphItem[]
  readonly edges: readonly GraphEdge[]
  readonly height: number
  readonly selected?: string | undefined
  readonly onSelect: (item: GraphItem) => void
}) {
  const { items, edges, height } = props
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string>()
  const [, setFrame] = useState(0)
  const simulation = useRef<Simulation<Point, Link> | undefined>(undefined)
  /** Where each item was, so a change to the understanding does not throw the whole drawing around. */
  const placed = useRef(new Map<string, { x: number; y: number }>())
  /** Whether the person has panned or zoomed: from then on the drawing stays where they put it. */
  const touched = useRef(false)

  useEffect(() => {
    const element = box.current
    if (element === null) return undefined
    const measure = (): void => setWidth(Math.max(200, Math.round(element.clientWidth)))
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { points, links } = useMemo(() => {
    const points: Point[] = items.map((item) => {
      const was = placed.current.get(item.id)
      return was === undefined ? { item } : { item, x: was.x, y: was.y }
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

  useEffect(() => {
    const still =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sim = forceSimulation(points)
      .force('charge', forceManyBody<Point>().strength(-240))
      .force(
        'link',
        forceLink<Point, Link>(links)
          .id((point) => point.item.id)
          .distance((link) => (link.type === 'evolves_to' ? 70 : 110)),
      )
      .force('center', forceCenter(width / 2, height / 2))
      // A gentle pull to the middle, so an item tied to nothing stays in view instead of drifting off.
      .force('x', forceX<Point>(width / 2).strength(0.07))
      .force('y', forceY<Point>(height / 2).strength(0.09))
      .force(
        'collide',
        // Labels run sideways, so an item keeps room in proportion to its words.
        forceCollide<Point>((point) => 16 + Math.min(point.item.label.length, 10) * 3.4),
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
    /** Frames everything, until the person has moved or zoomed the drawing themselves. */
    const fit = (): void => {
      if (touched.current || points.length === 0) return
      const xs = points.map((point) => point.x ?? width / 2)
      const ys = points.map((point) => point.y ?? height / 2)
      // Room for the labels, which run sideways from each point and sit below it.
      const left = Math.min(...xs) - 70
      const right = Math.max(...xs) + 70
      const top = Math.min(...ys) - 24
      const bottom = Math.max(...ys) + 36
      const k = Math.min(
        1.2,
        Math.max(MIN_SCALE, Math.min(width / (right - left), height / (bottom - top))),
      )
      setView({
        k,
        x: width / 2 - ((left + right) / 2) * k,
        y: height / 2 - ((top + bottom) / 2) * k,
      })
    }
    if (still) {
      sim.stop().tick(240)
      keep()
      fit()
      setFrame((count) => count + 1)
    } else {
      sim.on('end', fit)
      sim.on('tick', () => {
        keep()
        if (frame === 0) {
          frame = requestAnimationFrame(() => {
            frame = 0
            // The frame follows the layout as it settles, so nothing is ever drawn out of view.
            fit()
            setFrame((count) => count + 1)
          })
        }
      })
    }
    return () => {
      sim.stop()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [points, links, width, height])

  /** From a pointer on the screen to the drawing's own coordinates. */
  const toGraph = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = box.current?.getBoundingClientRect()
    const left = rect?.left ?? 0
    const top = rect?.top ?? 0
    return { x: (clientX - left - view.x) / view.k, y: (clientY - top - view.y) / view.k }
  }

  const zoomAt = (factor: number, clientX?: number, clientY?: number): void => {
    touched.current = true
    setView((now) => {
      const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, now.k * factor))
      const rect = box.current?.getBoundingClientRect()
      const px = clientX === undefined ? width / 2 : clientX - (rect?.left ?? 0)
      const py = clientY === undefined ? height / 2 : clientY - (rect?.top ?? 0)
      // The point under the pointer stays under it.
      return { k, x: px - ((px - now.x) / now.k) * k, y: py - ((py - now.y) / now.k) * k }
    })
  }

  const wheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
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
      const at = toGraph(step.clientX, step.clientY)
      point.fx = at.x
      point.fy = at.y
      simulation.current?.alphaTarget(0.25).restart()
    }
    const stop = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', stop)
      target.removeEventListener('pointercancel', stop)
      point.fx = null
      point.fy = null
      simulation.current?.alphaTarget(0)
      if (!moved) props.onSelect(point.item)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', stop)
    target.addEventListener('pointercancel', stop)
  }

  const neighbours = useMemo(() => {
    if (hovered === undefined) return undefined
    const near = new Set([hovered])
    for (const link of links) {
      const source = typeof link.source === 'object' ? link.source.item.id : String(link.source)
      const target = typeof link.target === 'object' ? link.target.item.id : String(link.target)
      if (source === hovered) near.add(target)
      if (target === hovered) near.add(source)
    }
    return near
  }, [hovered, links])

  if (items.length === 0) return null
  const counts = items.reduce<Record<ItemState, number>>(
    (sum, item) => ({ ...sum, [item.state]: sum[item.state] + 1 }),
    { held: 0, pending: 0, conflict: 0, challenged: 0, past: 0 },
  )
  return (
    <figure className="map knowledge-graph">
      <div className="graph-canvas" ref={box} style={{ height }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`理解图谱：${items.length} 条，${links.length} 条关系。结构视图里有同样的内容。`}
          onWheel={wheel}
        >
          <defs>
            <marker
              id="graph-arrow"
              viewBox="0 0 8 8"
              refX="17"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8 z" className="map-arrow" />
            </marker>
          </defs>
          <rect className="graph-ground" width={width} height={height} onPointerDown={pan} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {links.map((link) => {
              const source = link.source as Point
              const target = link.target as Point
              const lit =
                neighbours === undefined ||
                (neighbours.has(source.item.id) && neighbours.has(target.item.id))
              return (
                <line
                  key={`${source.item.id}-${link.type}-${target.item.id}`}
                  className={`map-edge map-${link.type}`}
                  data-dim={!lit}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  {...(ARROWED.has(link.type) ? { markerEnd: 'url(#graph-arrow)' } : {})}
                />
              )
            })}
            {points.map((point) => {
              const { item } = point
              const r = item.focus === true ? 10 : 7
              const lit = neighbours === undefined || neighbours.has(item.id)
              const x = point.x ?? width / 2
              const y = point.y ?? height / 2
              return (
                // biome-ignore lint: the structure view is the keyboard path to the same items
                <g
                  key={item.id}
                  className="map-node"
                  data-state={item.state}
                  data-dim={!lit}
                  data-selected={item.id === props.selected}
                  onPointerDown={(event) => drag(event, point)}
                  onPointerEnter={() => setHovered(item.id)}
                  onPointerLeave={() => setHovered(undefined)}
                >
                  <title>{item.label}</title>
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    data-held={item.state !== 'past'}
                    data-conflict={item.state === 'conflict'}
                  />
                  {item.state === 'challenged' && (
                    <circle className="badge" cx={x + r * 0.8} cy={y - r * 0.8} r={3} />
                  )}
                  <text x={x} y={y + r + 13} textAnchor="middle">
                    {hovered === item.id ? item.label : shortened(item.label, view.k)}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
        <div className="graph-tools">
          <button type="button" className="tool" aria-label="放大" onClick={() => zoomAt(1.25)}>
            +
          </button>
          <button type="button" className="tool" aria-label="缩小" onClick={() => zoomAt(0.8)}>
            −
          </button>
          <button
            type="button"
            className="tool"
            aria-label="重新排列并全部显示"
            onClick={() => {
              touched.current = false
              simulation.current?.alpha(0.3).restart()
            }}
          >
            ⟲
          </button>
        </div>
      </div>
      <figcaption className="graph-legend">
        <span data-state="held">已确认 {counts.held}</span>
        <span data-state="pending">待确认 {counts.pending}</span>
        <span data-state="conflict">有矛盾 {counts.conflict}</span>
        <span data-state="challenged">被质疑 {counts.challenged}</span>
        {counts.past > 0 && <span data-state="past">已修正或撤回 {counts.past}</span>}
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
