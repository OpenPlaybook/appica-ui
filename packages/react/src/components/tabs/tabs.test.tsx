import * as React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { describe, it, expect, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

function Demo(
  props: Omit<React.ComponentProps<typeof Tabs>, 'children'> & {
    secondDisabled?: boolean
    onTabClick?: (value: string) => void
  } = {},
) {
  const { secondDisabled = false, onTabClick, ...tabsProps } = props
  return (
    <Tabs defaultValue="one" {...tabsProps}>
      <TabsList>
        <TabsTrigger value="one" onClick={() => onTabClick?.('one')}>
          One
        </TabsTrigger>
        <TabsTrigger value="two" disabled={secondDisabled} onClick={() => onTabClick?.('two')}>
          Two
        </TabsTrigger>
        <TabsTrigger value="three" onClick={() => onTabClick?.('three')}>
          Three
        </TabsTrigger>
      </TabsList>
      <TabsContent value="one">Panel One</TabsContent>
      <TabsContent value="two">Panel Two</TabsContent>
      <TabsContent value="three">Panel Three</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it.each(['one', 'three'])('positions the selected indicator before hydration for %s', (value) => {
    const html = renderToStaticMarkup(<Demo defaultValue={value} />)
    const dom = new JSDOM(
      `<style>button { width: 80px; height: 32px; transform: none; translate: none; rotate: none; scale: none; }</style>${html}`,
      {
        runScripts: 'dangerously',
        beforeParse(window) {
          // Supply layout metrics that jsdom cannot measure while retaining parser-time script execution.
          Object.defineProperties(window.HTMLElement.prototype, {
            offsetWidth: { get() { return this.localName === 'button' ? 80 : 240 } },
            offsetHeight: { get() { return 32 } },
            scrollWidth: { get() { return 240 } },
            scrollHeight: { get() { return 32 } },
            offsetLeft: {
              get() {
                return this.localName === 'button'
                  ? Array.from(this.parentElement.children).filter((el: Element) => el.localName === 'button').indexOf(this) * 80
                  : 0
              },
            },
            offsetTop: { get() { return 0 } },
          })
        },
      },
    )

    try {
      const indicator = dom.window.document.querySelector<HTMLElement>('[data-slot="tabs-indicator"]')!
      expect(indicator.hidden).toBe(false)
      expect(indicator.style.getPropertyValue('--active-tab-width')).toBe('80px')
      expect(indicator.style.getPropertyValue('--active-tab-left')).toBe(value === 'one' ? '0px' : '160px')
      expect(dom.window.document.querySelector('[aria-selected="true"]')?.textContent).toBe(value === 'one' ? 'One' : 'Three')
    } finally {
      dom.window.close()
    }
  })

  it('renders composition with default-active panel visible', () => {
    render(<Demo />)
    expect(screen.getByRole('tablist')).toHaveAttribute('data-slot', 'tabs-list')
    const triggers = screen.getAllByRole('tab')
    expect(triggers).toHaveLength(3)
    expect(triggers[0]).toHaveAttribute('aria-selected', 'true')
    expect(triggers[1]).toHaveAttribute('aria-selected', 'false')

    expect(screen.getByText('Panel One')).toBeVisible()
    // Inactive panels are unmounted by default (`keepMounted` is false).
    expect(screen.queryByText('Panel Two')).toBeNull()
  })

  it('keeps inactive panels in the DOM when keepMounted is set on TabsContent', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one" keepMounted>
          Panel One
        </TabsContent>
        <TabsContent value="two" keepMounted>
          Panel Two
        </TabsContent>
      </Tabs>,
    )
    const inactive = screen.getByText('Panel Two')
    expect(inactive).toBeInTheDocument()
    expect(inactive).not.toBeVisible()
  })

  it('switches the active panel on click', async () => {
    const user = userEvent.setup()
    render(<Demo />)

    await user.click(screen.getByRole('tab', { name: 'Two' }))

    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Panel Two')).toBeVisible()
  })

  it('honors defaultValue', () => {
    render(<Demo defaultValue="three" />)
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Panel Three')).toBeVisible()
  })

  it('supports controlled mode', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    function Controlled() {
      const [value, setValue] = React.useState<string>('one')
      return (
        <Demo
          value={value}
          onValueChange={(next, details) => {
            onValueChange(next)
            setValue(next as string)
          }}
        />
      )
    }

    render(<Controlled />)
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Two' }))
    expect(onValueChange).toHaveBeenCalledWith('two')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
  })

  it('navigates horizontally via Arrow keys and activates on Enter', async () => {
    const user = userEvent.setup()
    render(<Demo />)

    const first = screen.getByRole('tab', { name: 'One' })
    first.focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
  })

  it('navigates vertically via ArrowDown when orientation="vertical"', async () => {
    const user = userEvent.setup()
    render(<Demo orientation="vertical" />)

    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical')

    const first = screen.getByRole('tab', { name: 'One' })
    first.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
  })

  it('does not activate disabled triggers on click', async () => {
    const user = userEvent.setup()
    const onTabClick = vi.fn()
    render(<Demo secondDisabled onTabClick={onTabClick} />)

    await user.click(screen.getByRole('tab', { name: 'Two' }))
    expect(onTabClick).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true')
  })

  it('applies data-slot attributes on each sub-component', () => {
    render(<Demo />)
    expect(screen.getByRole('tablist').closest('[data-slot="tabs"]')).not.toBeNull()
    expect(screen.getByRole('tablist')).toHaveAttribute('data-slot', 'tabs-list')
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('data-slot', 'tabs-trigger')
    expect(screen.getByText('Panel One').closest('[data-slot="tabs-content"]')).not.toBeNull()
  })

  it('throws when a sub-component is rendered outside <Tabs>', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TabsTrigger value="x">x</TabsTrigger>)).toThrow(/must be rendered inside <Tabs>/)
    spy.mockRestore()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Demo />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
