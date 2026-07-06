from pprint import pprint

from airc import Client


def run_step(name, fn):
    try:
        result = fn()
        print(f"[PASS] {name}")
        pprint(result)
    except Exception as err:
        print(f"[FAIL] {name}: {err}")


def main():
    client = Client("codex_py_test", registry="https://www.slashvibe.dev")

    run_step("register", lambda: client.register())
    run_step("heartbeat", lambda: client.heartbeat())
    run_step("send", lambda: client.send("airc_ambassador", "hello from python sdk validation"))
    run_step("poll", lambda: client.poll())


if __name__ == "__main__":
    main()
