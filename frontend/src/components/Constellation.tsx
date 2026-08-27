import { useEffect, useRef } from 'react'
import type { CategorySlice } from '@/types'

interface ConstellationProps {
  /** Categorias do período: definem quantos nós e o tamanho de cada um. */
  slices: CategorySlice[]
  /** Índice da categoria em destaque, ou null. */
  highlight: number | null
  /** Altura em px onde o centro da esfera é ancorado. */
  centerY?: number
}

interface Node {
  x: number
  y: number
  z: number
  size: number
  sliceIndex: number
  filled: boolean
}

const ACCENT = '#25d98a'
const FOCAL = 3.2
const NODE_COUNT = 34
const DUST_COUNT = 90

/**
 * Constelação 3D — o elemento que liga esta aplicação ao portfólio.
 *
 * A matemática de projeção é a mesma usada lá (rotação em Y, depois em X,
 * divisão pela distância focal de 3.2). O que muda é o significado: no
 * portfólio os nós são telemetria da máquina; aqui cada nó é uma categoria
 * de gasto, e o raio vem do valor gasto nela. O visual carrega dado, não
 * é enfeite.
 *
 * Fica atrás do conteúdo, sem capturar cliques, e é puramente decorativo do
 * ponto de vista de acessibilidade — toda a informação que ele sugere está
 * disponível em texto nos gráficos e listas.
 */
export function Constellation({ slices, highlight, centerY = 430 }: ConstellationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<Node[]>([])
  const dustRef = useRef<Array<{ x: number; y: number; z: number; s: number }>>([])
  const pointerRef = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 })
  const angleRef = useRef(0)

  // Estes valores mudam a cada render mas não devem reiniciar a animação:
  // guardá-los numa ref deixa o loop lê-los sem virar dependência do efeito.
  const highlightRef = useRef(highlight)
  const slicesRef = useRef(slices)
  highlightRef.current = highlight
  slicesRef.current = slices

  // Reconstrói os nós apenas quando os valores das categorias realmente mudam.
  const shapeKey = slices.map((s) => `${s.categoryId}:${s.total}`).join('|')

  useEffect(() => {
    const current = slicesRef.current
    const total = current.reduce((sum, s) => sum + s.total, 0) || 1

    // Espiral de Fibonacci: distribui os pontos uniformemente pela esfera.
    // Sorteio aleatório criaria aglomerados visíveis perto dos polos.
    const golden = Math.PI * (3 - Math.sqrt(5))
    const nodes: Node[] = []

    for (let i = 0; i < NODE_COUNT; i++) {
      const y = 1 - (i / (NODE_COUNT - 1)) * 2
      const radius = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = golden * i
      const sliceIndex = current.length > 0 ? i % current.length : 0
      const weight = current.length > 0 ? current[sliceIndex].total / total : 0.1

      nodes.push({
        x: Math.cos(theta) * radius,
        y,
        z: Math.sin(theta) * radius,
        size: 1.6 + weight * 22,
        sliceIndex,
        filled: i % 3 === 0,
      })
    }
    nodesRef.current = nodes

    if (dustRef.current.length === 0) {
      dustRef.current = Array.from({ length: DUST_COUNT }, () => ({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: (Math.random() - 0.5) * 2,
        s: Math.random() * 1.6 + 0.4,
      }))
    }
  }, [shapeKey])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    // Respeita quem pediu menos movimento: desenha um quadro estático.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerRef.current.tx = (event.clientX - rect.left) / rect.width
      pointerRef.current.ty = (event.clientY - rect.top) / rect.height
    }
    if (!reduced) window.addEventListener('mousemove', onMove)

    let frame = 0

    const project = (
      point: { x: number; y: number; z: number },
      radius: number,
      cx: number,
      cy: number,
      rotY: number,
      rotX: number,
    ) => {
      let x = point.x * Math.cos(rotY) - point.z * Math.sin(rotY)
      let z = point.x * Math.sin(rotY) + point.z * Math.cos(rotY)
      const y = point.y * Math.cos(rotX) - z * Math.sin(rotX)
      z = point.y * Math.sin(rotX) + z * Math.cos(rotX)
      const scale = FOCAL / (FOCAL + z)
      return { sx: cx + x * radius * scale, sy: cy + y * radius * scale, scale }
    }

    const draw = () => {
      if (!reduced) frame = requestAnimationFrame(draw)

      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)

      const nodes = nodesRef.current
      if (nodes.length === 0) return

      // Deslocada para a direita: a coluna de texto à esquerda precisa
      // ficar limpa, senão a constelação vira ruído atrás do número.
      const wide = width > 900
      const cx = width * (wide ? 0.74 : 0.5)
      const cy = centerY
      const radius = Math.min(width, 900) * (wide ? 0.3 : 0.42)

      const pointer = pointerRef.current
      pointer.x += (pointer.tx - pointer.x) * 0.045
      pointer.y += (pointer.ty - pointer.y) * 0.045
      const px = (pointer.x - 0.5) * 0.55
      const py = (pointer.y - 0.5) * 0.35

      angleRef.current += 0.0015
      const angle = angleRef.current
      const rotY = angle + px
      const rotX = Math.sin(angle * 0.4) * 0.22 + py

      // Poeira ao fundo, num raio maior e girando mais devagar: cria
      // separação de planos sem precisar de blur.
      context.fillStyle = ACCENT
      for (const speck of dustRef.current) {
        const p = project(speck, radius * 2.5, cx, cy, angle * 0.28 + px * 0.4, rotX * 0.5)
        context.globalAlpha = 0.085 * p.scale
        context.fillRect(p.sx, p.sy, speck.s, speck.s)
      }
      context.globalAlpha = 1

      const points = nodes.map((node) => ({ ...project(node, radius, cx, cy, rotY, rotX), node }))

      // Liga pontos próximos, com a opacidade caindo com a distância.
      const maxDistance = radius * 0.95
      context.strokeStyle = ACCENT
      context.lineWidth = 0.6
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const distance = Math.hypot(points[i].sx - points[j].sx, points[i].sy - points[j].sy)
          if (distance < maxDistance) {
            context.beginPath()
            context.moveTo(points[i].sx, points[i].sy)
            context.lineTo(points[j].sx, points[j].sy)
            context.globalAlpha = (1 - distance / maxDistance) * 0.2
            context.stroke()
          }
        }
      }
      context.globalAlpha = 1

      // Do fundo para a frente, para a sobreposição ficar correta.
      points.sort((a, b) => a.scale - b.scale)

      const active = highlightRef.current
      const currentSlices = slicesRef.current

      for (const point of points) {
        const isHot = active !== null && point.node.sliceIndex === active
        const slice = currentSlices[point.node.sliceIndex]
        const color = isHot && slice ? slice.color : ACCENT
        const size = point.node.size * point.scale

        context.beginPath()
        context.moveTo(point.sx, point.sy - size)
        context.lineTo(point.sx + size * 0.87, point.sy + size * 0.5)
        context.lineTo(point.sx - size * 0.87, point.sy + size * 0.5)
        context.closePath()

        context.globalAlpha = isHot ? 0.95 : 0.3 * point.scale
        if (point.node.filled || isHot) {
          context.fillStyle = color
          context.fill()
        } else {
          context.strokeStyle = color
          context.lineWidth = 1
          context.stroke()
        }
      }
      context.globalAlpha = 1
    }

    draw()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', onMove)
    }
  }, [centerY])

  /*
   * Duas máscaras combinadas por interseção — a constelação só aparece onde
   * ambas permitem.
   *
   * HORIZONTAL: apaga a faixa esquerda, onde fica a coluna de texto. Sem
   * isso os triângulos passam por cima do saldo, que é a informação mais
   * importante da tela. Posicionar a esfera só à direita não bastaria: em
   * telas estreitas ela precisa centralizar para não sair do enquadramento,
   * e voltaria a cobrir o texto. A máscara age sobre o resultado final, não
   * sobre a posição, então resolve nas duas situações.
   *
   * VERTICAL: apaga tudo abaixo da dobra. A constelação é um elemento de
   * abertura; continuar desenhando atrás dos painéis de dados mais abaixo
   * só acrescenta ruído sobre gráficos e tabelas, que precisam de fundo
   * limpo para serem lidos.
   */
  const maskHorizontal =
    'linear-gradient(to right, transparent 0%, transparent 38%, black 74%, black 100%)'
  const maskVertical = 'linear-gradient(to bottom, black 0px, black 380px, transparent 760px)'
  const mask = `${maskHorizontal}, ${maskVertical}`

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      }}
    />
  )
}
