import { describe, expect, it } from 'vitest'
import {
  isCurrent,
  normalisePath,
  pathOf,
  shapeOf,
  titleOf,
} from '../../apps/mindlink/web/src/paths.js'

describe('route paths', () => {
  it('treats an empty path and stray slashes as the same route', () => {
    expect(normalisePath('')).toBe('/')
    expect(normalisePath('/')).toBe('/')
    expect(normalisePath('projects/')).toBe('/projects')
    expect(normalisePath('//projects//p1/')).toBe('/projects/p1')
  })

  it('builds a path with its parameters and query encoded', () => {
    expect(pathOf('/projects/:id', { id: 'a/b c' }, { tab: '设置' })).toBe(
      '/projects/a%2Fb%20c?tab=%E8%AE%BE%E7%BD%AE',
    )
    expect(pathOf('/')).toBe('/')
    expect(() => pathOf('/projects/:id')).toThrow(/needs "id"/)
  })

  it('sees two patterns that differ only in parameter names as one shape', () => {
    expect(shapeOf('/a/:id/')).toBe(shapeOf('a/:key'))
    expect(shapeOf('/a/:id')).not.toBe(shapeOf('/a/new'))
  })

  it('marks a navigation entry current on its own page and the pages under it', () => {
    expect(isCurrent('/projects', '/projects')).toBe(true)
    expect(isCurrent('/projects', '/projects/p1')).toBe(true)
    expect(isCurrent('/projects', '/projectsx')).toBe(false)
    expect(isCurrent('/', '/projects')).toBe(false)
    expect(isCurrent('/', '/')).toBe(true)
  })

  it('titles a page after its name', () => {
    expect(titleOf('学习项目')).toBe('学习项目 · MindLink')
    expect(titleOf(undefined)).toBe('MindLink')
  })
})
