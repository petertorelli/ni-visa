# Update

[Jürgen](https://github.com/Jorgen-VikingGod) pointed me to the [Rohde-Schwartz drivers](https://www.rohde-schwarz.com/de/applikationen/r-s-visa-application-note_56280-148812.html) which are open-source and work on Windows, macOS and Linux (including Raspbian)!

# About

This is a Node.JS wrapper for the National Instruments [VISA (Virtual Instrument Software Architecture)](https://en.wikipedia.org/wiki/Standard_Commands_for_Programmable_Instruments) library. The VISA library implements the [SCPI (Standard Commands for Programmable Instruments)](https://en.wikipedia.org/wiki/Standard_Commands_for_Programmable_Instruments) syntax and commands.

The library is [available](https://www.ni.com/visa/) from National Instruments for Windows and macOS, and supports GPIB, USB, Serial, Ethernet, VXI and PXI interfaces.

The sample `test.js` uses the module `n6705b` which supports data collection from a 6781 power module to perform data collection.

# Wrapping

This implementation uses `ffi` to export wrapper functions.

# TODO

1. Error handling - provide an interface for a custom error handler
2. Solve the FFI DynamicLibrary issue (it appends the .dylib library suffix which breaks on recent macOS)
3. Make it more "npm package-y"
4. Implement the full v19 API, not just the basic functions


# Thanks

Originally inspired by Jürgen Skrotzky's [visa32 project](https://github.com/Jorgen-VikingGod/visa32).
