# About

This is a Node.JS wrapper for the National Instruments [VISA (Virtual Instrument Software Architecture)](https://en.wikipedia.org/wiki/Standard_Commands_for_Programmable_Instruments) library. The VISA library implements the [SCPI (Standard Commands for Programmable Instruments)](https://en.wikipedia.org/wiki/Standard_Commands_for_Programmable_Instruments) syntax and commands.

The library is [available](https://www.ni.com/visa/) from National Instruments for Windows and macOS, and supports GPIB, USB, Serial, Ethernet, VXI and PXI interfaces.

# Wrapping

This implementation uses `ffi` to export wrapper functions.

# TODO

1. Error handling - provide an interface for a custom error handler
2. Solve the FFI DynamicLibrary issue (it appends the .dylib library suffix which breaks on recent macOS)
3. Make it more "npm package-y"
4. Implement the full v19 API, not just the basic functions
5. NI doesn't support linux, would be nice to write a raw VISA interface using the NodeJS 'usb' module.


# Thanks

Originally inspired by Jürgen Skrotzky's [visa32 project](https://github.com/Jorgen-VikingGod/visa32).
