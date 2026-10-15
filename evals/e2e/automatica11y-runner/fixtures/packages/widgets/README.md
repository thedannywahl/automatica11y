# @a11y-eval/widgets

A tiny React component library. It exists only to exercise the automatica11y evals.

```bash
npm install @a11y-eval/widgets react react-dom
```

## Button and Link

Both pass every prop through to the native element.

```jsx
import { Button, Link } from "@a11y-eval/widgets";

<Button onClick={save}>Save</Button>
<Link href="/help">Help</Link>
```

## Dialog

Build a dialog from its parts. Every part passes its props through.

```jsx
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@a11y-eval/widgets";

<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent aria-labelledby="title">
    <DialogTitle id="title">Edit profile</DialogTitle>
    <DialogClose>Close</DialogClose>
  </DialogContent>
</Dialog>
```

## Tabs

`Tabs` takes its tabs as data. It has no child parts, and it doesn't pass unknown props through. To put attributes on the rendered elements, use these props:

| Prop | Type | What it does |
| --- | --- | --- |
| `label` | `string` | The accessible name of the tab list. Required. |
| `items` | `Array<{ label: string, content: ReactNode }>` | One entry per tab. Required. |
| `defaultIndex` | `number` | The tab selected at first. Defaults to `0`. |
| `listProps` | `object` | Props spread onto the element with `role="tablist"`. |
| `tabProps` | `(index: number) => object` | Called for each tab. The props it returns are spread onto that tab's element with `role="tab"`. |

```jsx
import { Tabs } from "@a11y-eval/widgets";

<Tabs
  label="Account settings"
  items={[
    { label: "Profile", content: <p>Profile settings</p> },
    { label: "Security", content: <p>Security settings</p> },
  ]}
  listProps={{ className: "settings-tabs" }}
  tabProps={(index) => ({ "data-index": index })}
/>
```

Arrow keys move between tabs, and Home and End jump to the first and last.
