"""Opt-in real HA→Luna→kiosk smoke. Mutates the configured session, never Mealie.
Requires Playwright, KIOSK_TEST_HA_URL and KIOSK_TEST_HA_TOKEN in environment.
Run with --yes; native microphone/speaker acceptance remains user-driven.
"""
import json
import os
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

if '--yes' not in sys.argv:
    raise SystemExit('Requires --yes: this opens, navigates and closes recipes on the configured kiosk.')
base = os.environ.get('KIOSK_TEST_BASE_URL', 'https://kiosk-dev.eos.mxwy.org').rstrip('/')
ha = os.environ['KIOSK_TEST_HA_URL'].rstrip('/')
key = os.environ['KIOSK_TEST_HA_TOKEN']
conversation_id = None


def request(url, data=None, token=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    with urllib.request.urlopen(req, timeout=150) as response:
        return json.load(response)


def state():
    return request(base + '/api/session')


def ask(text):
    global conversation_id
    body = {'text': text, 'agent_id': 'conversation.hermes', 'language': 'en'}
    if conversation_id:
        body['conversation_id'] = conversation_id
    started = time.monotonic()
    response = request(ha + '/api/services/conversation/process?return_response', body, key)
    result = response['service_response']
    conversation_id = result['conversation_id']
    speech = result['response']['speech'].get('plain', {}).get('speech', '')
    print(json.dumps({'ask': text, 'reply': speech, 'seconds': round(time.monotonic() - started, 1)}, ensure_ascii=False), flush=True)
    if result['response'].get('response_type') == 'error':
        raise AssertionError(result['response'])
    return speech


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base)
    page.wait_for_function("document.querySelector('.ambient, .recipe') !== null")
    ask('Open the chicken enchiladas recipe on the kitchen screen.')
    current = state()
    assert current['recipe'] and 'enchiladas' in current['recipe']['title'].lower(), 'Voice did not open enchiladas'
    title = current['recipe']['title']
    expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible()
    ask('What is the first ingredient in the recipe on screen?')
    assert state()['revision'] == current['revision'], 'A question changed the session'
    ask('Go to step three of this recipe.')
    current = state()
    assert current['selected'] == current['recipe']['steps'][2]['id'], 'Voice did not select step three'
    expect(page.locator('.step.selected .stepnum')).to_have_text('Step 3')
    ask('What comes next in this recipe?')
    assert state()['revision'] == current['revision'], 'What comes next advanced the session'
    ask('Next step in this recipe.')
    current = state()
    assert current['selected'] == current['recipe']['steps'][3]['id'], 'Voice did not advance to step four'
    expect(page.locator('.step.selected .stepnum')).to_have_text('Step 4')
    ask('Go back one recipe step.')
    current = state()
    assert current['selected'] == current['recipe']['steps'][2]['id'], 'Voice did not go back to step three'
    # Simulate an actual touch open using a second browser page and the real picker.
    touch = browser.new_page(viewport={'width': 1280, 'height': 800})
    touch.goto(base)
    touch.get_by_role('button', name='Finish cooking', exact=True).click()
    touch.get_by_role('button', name='Open recipes', exact=True).click()
    touch.get_by_label('Search recipes').fill('chili')
    touch.get_by_role('button', name='Search', exact=True).click()
    touch.get_by_role('button', name='White Chicken Chili', exact=False).click()
    expect(page.get_by_role('heading', name='White Chicken Chili', exact=True)).to_be_visible()
    reply = ask('What recipe is on the screen now?')
    assert 'chili' in reply.lower(), 'Luna used stale conversation instead of the touched recipe'
    ask('Close the recipe on the kitchen screen.')
    assert state()['recipe'] is None, 'Voice did not close recipe'
    expect(page.locator('.ambient')).to_be_visible()
    assert not errors, errors
    browser.close()
print('PASS: real HA conversation bridge, Luna tools, Mealie open, recipe question, goto/next/previous, non-mutating peek, touch-switch freshness, live browser updates and voice close.')
