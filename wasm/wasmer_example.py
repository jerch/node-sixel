#!/usr/bin/env python3

# Rudimentary test with wasmer-python
#
# Install with:
# - pip install wasmer==1.0.0
# - pip install wasmer_compiler_llvm==1.0.0
#
# Note: wasmer-python 1.0 does not support the bulk-memory feature,
#       thus compile wasm file without -mbulk-memory flag


from wasmer import engine, Store, Module, Instance, ImportObject, Function
from wasmer_compiler_llvm import Compiler


# some test data:
# - broken attributes --> mode 1
# - 2 lines with width 7
# - pending line with current_width 2
TEST = b'"1;1;7ABCDEFG$-ABCDEFG$-AB'


def handle_band(width: int) -> int:
    print('got a line of:', width)
    assert width == 7
    return 0

def mode_parsed(mode: int) -> int:
    print('mode selected:', mode)
    assert mode == 1
    return 0

# load wasm engine
store = Store(engine.JIT(Compiler))
module = Module(store, open('./decoder.wasm', 'rb').read())
import_object = ImportObject()
import_object.register("env", {
    "handle_band": Function(store, handle_band),
    'mode_parsed': Function(store, mode_parsed),
})
instance = Instance(module, import_object)
mem = instance.exports.memory.int8_view()
chunk_address = instance.exports.get_chunk_address()

# load test data
mem[chunk_address:] = TEST

# run
instance.exports.init(-1, 0, 256, 1)
instance.exports.decode(0, len(TEST))

print('current_width:', instance.exports.current_width())
assert instance.exports.current_width() == 2
