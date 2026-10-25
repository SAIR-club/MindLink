import { describe, expect, it } from 'vitest'
import {
  hrefOf,
  matchPath,
  normalisePath,
  parseHash,
  resolveRoute,
  shapeOf,
} from '../../apps/mindlink/web/router.js'

describe('the router', () => {
  it('reads the path and query from a hash', () => {
    const { path, query } = parseHash('#/projects/p1?tab=settings&x=1')
    expect(path).toBe('/projects/p1')
    expect(query.get('tab')).toBe('settings')
    expect(query.get('x')).toBe('1')
  })

  it('treats an empty hash, a missing # and stray slashes as the same routes', () => {
    expect(parseHash('').path).toBe('/')
    expect(parseHash('#').path).toBe('/')
    expect(parseHash('#/').path).toBe('/')
    expect(parseHash('projects/').path).toBe('/projects')
    expect(normalisePath('//projects//p1/')).toBe('/projects/p1')
  })

  it('matches a pattern and decodes its parameters', () => {
    expect(matchPath('/projects/:id', '/projects/a%20b')).toEqual({ id: 'a b' })
    expect(matchPath('/projects/:id/settings', '/projects/p1/settings')).toEqual({ id: 'p1' })
    expect(matchPath('/projects', '/projects')).toEqual({})
  })

  it('does not match another path, another length or bad encoding', () => {
    expect(matchPath('/projects/:id', '/threads/t1')).toBeUndefined()
    expect(matchPath('/projects/:id', '/projects')).toBeUndefined()
    expect(matchPath('/projects/:id', '/projects/p1/settings')).toBeUndefined()
    expect(matchPath('/projects/:id', '/projects/%E0%A4%A')).toBeUndefined()
  })

  it('prefers the route with fewer parameters, whatever the order', () => {
    const routes = [{ path: '/projects/:id' }, { path: '/projects/new' }]
    expect(resolveRoute(routes, '/projects/new')?.route.path).toBe('/projects/new')
    expect(resolveRoute(routes, '/projects/p1')).toEqual({
      route: { path: '/projects/:id' },
      params: { id: 'p1' },
    })
    expect(resolveRoute(routes, '/nowhere')).toBeUndefined()
  })

  it('builds a hash with its parameters encoded, which parses back to the same route', () => {
    const href = hrefOf('/projects/:id', { id: 'a/b c' }, { tab: '设置' })
    expect(href).toBe('#/projects/a%2Fb%20c?tab=%E8%AE%BE%E7%BD%AE')
    const { path, query } = parseHash(href)
    expect(matchPath('/projects/:id', path)).toEqual({ id: 'a/b c' })
    expect(query.get('tab')).toBe('设置')
    expect(hrefOf('/')).toBe('#/')
    expect(() => hrefOf('/projects/:id')).toThrow(/needs "id"/)
  })

  it('sees two patterns that differ only in parameter names as one shape', () => {
    expect(shapeOf('/a/:id/')).toBe(shapeOf('a/:key'))
    expect(shapeOf('/a/:id')).not.toBe(shapeOf('/a/new'))
  })
})
