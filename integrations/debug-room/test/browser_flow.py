"""Run against a running room service. --live requires real Nexconn credentials."""
import argparse
import os
import re
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4174")
parser.add_argument("--live", action="store_true")
args = parser.parse_args()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    developer, teammate, stranger = [browser.new_context() for _ in range(3)]
    host, guest, outsider = [c.new_page() for c in (developer, teammate, stranger)]
    host.set_default_timeout(20000)
    guest.set_default_timeout(20000)
    host.goto(args.url)
    # Load the shipped SDK before any test-only transport interception. This
    # catches broken browser bundles even when no Nexconn credentials are set.
    host.evaluate("""async () => {
        const sdk = await import('/vendor/nexconn.js');
        const methods = [sdk.NCEngine.initialize, sdk.NCEngine.connect,
                         sdk.NCEngine.addMessageHandler, sdk.NCEngine.addConnectionStatusHandler,
                         sdk.BaseChannel.createMessagesQuery, sdk.DirectChannel,
                         sdk.SendTextMessageParams, sdk.MessageHandler, sdk.ConnectionStatusHandler];
        if (methods.some(method => typeof method !== 'function') ||
            sdk.AreaCode.SG === undefined || sdk.MessageType.TEXT === undefined ||
            sdk.ConnectionStatus.CONNECTED === undefined) {
            throw new Error('Nexconn browser SDK exports are incomplete');
        }
    }""")
    print("PASS — official Nexconn browser SDK imports without credentials.")
    host.get_by_role("button", name="Ask for help").click()
    choice = host.get_by_role("checkbox").first
    expect(host.locator("#create")).to_be_disabled()
    choice.check()
    expect(host.locator("#preview")).to_have_text("Cannot find module './prcing.mjs'")
    host.locator("#create").click()
    expect(host.locator("#room")).to_be_visible()
    original_url = host.url
    host.locator("#invite").click()
    invite = host.locator("#inviteUrl")
    expect(invite).to_have_value(re.compile(r"^https?://[^#]+#invite=[A-Za-z0-9_-]+$"))
    link = invite.input_value()
    outsider.goto(link.split("#")[0] + "#invite=invalid")
    expect(outsider.locator("#reason")).to_contain_text("invite")
    guest.goto(link)
    expect(guest.locator("#seat")).to_have_text("Teammate view")
    expect(guest.locator("#excerpt")).to_have_text("Cannot find module './prcing.mjs'")
    expect(guest.locator("#sharing")).to_be_hidden()
    expect(guest.locator("#sampleFix")).to_be_hidden()
    guest.reload()
    expect(guest.locator("#room")).to_be_visible()
    outsider.goto(link)
    expect(outsider.locator("#invalid")).to_be_visible()
    if args.live:
        expect(host.locator("#connection")).to_have_text("Live", timeout=30000)
        expect(guest.locator("#connection")).to_have_text("Live", timeout=30000)
        host.locator("#draft").fill("Can you spot the missing import?")
        host.locator("#send").click()
        expect(guest.locator("#messages")).to_contain_text("Can you spot the missing import?")
        guest.locator("#draft").fill("Change ./prcing.mjs to ./pricing.mjs in storefront.mjs.")
        guest.locator("#send").click()
        expect(host.locator("#messages")).to_contain_text("Change ./prcing.mjs")
        host.reload()
        host.get_by_role("button", name="Accept as solution").click()
        expect(guest.locator("#solution")).to_contain_text("Change ./prcing.mjs")
        expect(guest.locator("#status")).to_have_text("No rerun recorded.")
    else:
        expect(host.locator("#chatError")).to_be_visible(timeout=30000)
        expect(host.locator("#send")).to_be_disabled()
        host.locator("#draft").fill("Draft retained through reconnect")
        host.locator("#retry").click()
        expect(host.locator("#draft")).to_have_value("Draft retained through reconnect")
    host.locator("#sampleFix button").click()
    expect(guest.locator("#status")).to_contain_text("ERROR", timeout=10000)
    host.locator("#module").select_option("./pricing.mjs")
    host.locator("#sampleFix button").click()
    expect(guest.locator("#status")).to_contain_text("READY", timeout=10000)
    guest.reload()
    expect(guest.locator("#artifact")).to_be_visible()
    if args.live:
        expect(guest.locator("#messages")).to_contain_text("Change ./prcing.mjs")
        expect(guest.locator("#solution")).to_contain_text("Change ./prcing.mjs")
    with guest.expect_popup() as result:
        guest.locator("#artifact").click()
    expect(result.value.get_by_text("Notebook · $12")).to_be_visible()
    outsider.goto(args.url)
    outsider.locator("#ask").click()
    outsider.get_by_role("checkbox").first.check()
    outsider.locator("#create").click()
    expect(outsider.locator("#solution")).to_contain_text("Waiting")
    if args.live:
        expect(outsider.locator("#connection")).to_have_text("Live")
        expect(outsider.locator(".message")).to_have_count(0)
    outsider.goto(original_url)
    expect(outsider.locator("#invalid")).to_be_visible()
    if not args.live:
        # Exercise the actual composer with a rejected transport acknowledgement.
        # These routes exist only in the test browser. No fake transport is shipped.
        from json import dumps
        failed = developer.new_page()
        failed.route("**/api/rooms/*/chat", lambda route: route.fulfill(
            content_type="application/json", body=dumps({"appKey":"test","token":"test","self":"dev","peer":"guest","area":"SG"})))
        failed.route("**/vendor/nexconn.js", lambda route: route.fulfill(
            content_type="application/javascript", body="""
              export const AreaCode={SG:1},ConnectionStatus={CONNECTED:0},MessageType={TEXT:'text'};
              export class MessageHandler{constructor(p){Object.assign(this,p)}}
              export const ConnectionStatusHandler=MessageHandler,SendTextMessageParams=MessageHandler;
              export const NCEngine={initialize(){},addMessageHandler(){},addConnectionStatusHandler(){},async connect(){return {code:0,data:{userId:'dev'}}}};
              export const BaseChannel={createMessagesQuery:()=>({loadNextPage:async()=>({code:0,data:{data:[]}})})};
              let attempts=0;
              export class DirectChannel {identifier={}; async sendMessage(p){return ++attempts===1 ? {code:503} :
                {code:0,data:{messageId:'unit-retry',sentTime:1,channelId:'guest',senderUserId:'dev',messageType:'text',content:{text:p.text}}}}}
            """))
        failed.goto(original_url)
        failed.locator("#draft").fill("Recoverable test draft")
        failed.locator("#send").click()
        expect(failed.locator("#chatError")).to_contain_text("not confirmed")
        expect(failed.locator("#draft")).to_have_value("Recoverable test draft")
        expect(failed.locator(".message")).to_have_count(0)
        failed.locator("#send").click()
        expect(failed.locator(".message")).to_have_count(1)
        expect(failed.locator("#draft")).to_have_value("")
        print("PASS — browser test double: rejected acknowledgement, retained draft, successful retry.")
    browser.close()
    print("PASS — two independent seats, excerpt, refresh, invite replay, isolation, real sample failure/fix/build.")
    print("PASS — official Nexconn bidirectional delivery, remote history and accepted reply." if args.live else
          "Credential-free run. Live delivery, remote history and live acceptance were not exercised.")
