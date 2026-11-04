# ags-services
### GObject based classes for the convenient CPU, GPU, memory and disk metrics bindings for your Aylur's GTK Shell widgets.
#### These services are meant to spare you from the routine task of reading sysfs files or creating background subprocesses.
***
### Usage examples:
#### CPU:
```
import { createBinding } from "gnim"
import Cpu from ./Cpu

const cpu = Cpu.default

const usage = createBinding(cpu, "usage")
const packageTemp = createBinding(cpu, "packageTemp")

const widget = () => (
  <box spacing={10}>
    <label label="Your CPU model name" />
    <label label={usage(value => `${value}%`)} />
    <label label={packageTemp(value => `${value}°C`)} />
  </box>
)
```
#### Memory:
```
import { createBinding } from "gnim"
import Memory from ./Memory

const memory = Memory.default

const usedPercent = createBinding(memory, "usedPercent")
const total = createBinding(memory, "total")

const widget = () => (
  <box spacing={10}>
    <label label={usedPercent(value => `${value}%`)} />
    <label label={total(value => `${Memory.toGB(value)} GB`)} />
  </box>
)
```
***
### Installation:
> [!WARNING]
> Make sure you have a fully working [Aylur's GTK Shell](https://aylur.github.io/ags/) project
```bash
git clone https://github.com/Nxxxxxp/ags-services.git ~/.config/ags/services
```
or clone to your own target directory.  
Now you can import files into your code as shown above in the examples
