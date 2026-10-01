# Fragms

Beautiful ready made components for AI interfaces. Each one is a single React
file you copy into your project and own from then on. No package to install,
no setup, no Tailwind required.

See them live, tune every setting and copy the code at
**[fragms.simonveprek.cz](https://fragms.simonveprek.cz)**.

## Components

| Component | What it does | Needs |
| --- | --- | --- |
| [Aura](components/aura.tsx) | A glow on the inside edge of a shape that follows a voice | React |
| [Points](components/points.tsx) | Little agents with a face that think, talk, listen and nap | React |
| [Ghost](components/ghost.tsx) | An AI cursor that works your interface for real | React, Framer Motion |
| [Composer](components/composer.tsx) | The prompt box, with files, a model picker, voice and stop | React, Framer Motion, Aura |
| [Context](components/context.tsx) | A ring that shows how full the model's memory is | React |

## Install

Save a file straight into your project.

```bash
curl --create-dirs -o src/components/aura.tsx https://fragms.simonveprek.cz/source/aura
```

The Composer uses Aura for its glow while it listens, so save both side by side.

```bash
npm install framer-motion
curl --create-dirs -o src/components/composer.tsx https://fragms.simonveprek.cz/source/composer -o src/components/aura.tsx https://fragms.simonveprek.cz/source/aura
```

Already set up with shadcn? Every component is in the registry too, and anything
a component needs comes with it.

```bash
npx shadcn@latest add https://fragms.simonveprek.cz/r/composer.json
```

Or copy the file from the `components` folder here. That is all an install is.

## Use

Every file starts with a short guide and an example. Aura, for instance.

```tsx
import { Aura, demoLevel } from "@/components/aura";

<Aura level={demoLevel} style={{ width: 240, height: 490, borderRadius: 46 }} />;
```

Each showcase on the site lists every setting, what it takes and its default,
and has instructions you can paste into Claude or ChatGPT to wire it up for you.

## Versions

The version sits in the header of each file. Installs always fetch the latest,
so check the header before you replace a file you have changed.

## License

[MIT](LICENSE). Use them in anything, change them however you like.

Made by [Šimon Vepřek](https://simonveprek.cz).
