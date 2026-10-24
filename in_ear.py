# predmaxim.presence: are the earbuds in the ears, through OpenFreebuds (system python3).
# Usage: in_ear.py NAME ADDRESS — NAME as OpenFreebuds knows the model ("HUAWEI FreeBuds Pro 4").
# Prints "in" (at least one bud in an ear) or "out" (both out) on every change and right
# after connecting, "unknown" while not connected; exits 0 when there's no sensor to read.
import asyncio
import ctypes
import signal
import sys

# PR_SET_PDEATHSIG: a killed shell must not leave a holder of the earbuds' channel behind.
ctypes.CDLL(None).prctl(1, signal.SIGTERM)

try:
    import openfreebuds
    from openfreebuds.driver import DEVICE_TO_DRIVER_MAP
    from openfreebuds.driver.huawei.driver.generic import OfbDriverHandlerHuawei
except ImportError:
    print("unknown", flush=True)
    sys.exit(0)

last = None


def report(value):
    global last
    if value != last:
        print(value, flush=True)
        last = value


class InEar(OfbDriverHandlerHuawei):
    # FreeBuds Pro 4: 2b 25 on every change, 2b ac with the current state on connect;
    # param 1 is the left bud, 2 the right, 1 — in an ear. The Pro 3 handler (2b 03) stays silent.
    handler_id = "predmaxim_in_ear"
    commands = [b"\x2b\x25", b"\x2b\xac"]

    async def on_package(self, package):
        sides = package.find_param(1) + package.find_param(2)
        if sides:
            report("in" if 1 in sides else "out")


def with_in_ear(driver):
    class Driver(driver):
        def __init__(self, address):
            super().__init__(address)
            self.handlers.append(InEar())

        async def stop(self):
            await super().stop()
            report("unknown")

    return Driver


async def main(name, address):
    report("unknown")
    if name not in DEVICE_TO_DRIVER_MAP:
        return
    # The manager builds a new driver on every start(), so the class carries the handler.
    DEVICE_TO_DRIVER_MAP[name] = with_in_ear(DEVICE_TO_DRIVER_MAP[name])
    ofb = await openfreebuds.create()
    if ofb.role == "client":  # another OpenFreebuds already holds the earbuds
        return
    await ofb.start(name, address)
    await asyncio.Event().wait()


asyncio.run(main(sys.argv[1], sys.argv[2]))
