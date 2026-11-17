"""Run with python -m unittest discover -s integrations/hermes-kiosk-recipes."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

spec = importlib.util.spec_from_file_location('kiosk_plugin', Path(__file__).with_name('__init__.py'))
assert spec and spec.loader
plugin = importlib.util.module_from_spec(spec)
if Path(spec.origin or '').exists(): spec.loader.exec_module(plugin)

class PluginTests(unittest.TestCase):
    def test_registers_only_four_narrow_tools(self):
        entries = []
        class Context:
            def register_tool(self, **kw): entries.append(kw)
            def register_hook(self, *args): pass
        self.assertTrue(hasattr(plugin, 'register'), 'recipe plugin is not implemented')
        plugin.register(Context())
        self.assertEqual([x['name'] for x in entries], ['kiosk_find_recipe', 'kiosk_current_recipe', 'kiosk_recipe_control', 'kiosk_go_to_step'])
        self.assertTrue(all(x['toolset'] == 'kiosk_recipes' for x in entries))

    def test_transport_and_context_preserve_recipe_and_revision(self):
        calls = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args): pass
            def do_POST(self):
                calls.append((self.path, self.headers.get('Authorization'), json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
                self.send_response(200); self.end_headers()
                self.wfile.write(json.dumps({'revision': 7, 'selected': 'a', 'recipe': {'steps': [{'id': 'a', 'text': 'Chop.'}, {'id': 'b', 'text': 'Simmer.'}], 'ingredients': [{'text': '½ tsp salt'}]}}).encode())
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with patch.object(plugin, '_settings', return_value=(f'http://127.0.0.1:{server.server_port}', 'TEST_KEY')):
                result = json.loads(plugin._current({}))
                self.assertEqual(result['selectedStep'], 1)
                self.assertEqual(result['nextStep']['number'], 2)
                self.assertEqual(result['revision'], 7)
                self.assertEqual(result['recipe']['ingredients'][0]['text'], '½ tsp salt')
                plugin._go_to({'step': 2})
                plugin._find({'query': 'soup', 'open': True})
            self.assertEqual(calls[0], ('/api/voice', 'Bearer TEST_KEY', {'action': 'current'}))
            self.assertEqual(calls[1][2], {'action': 'current'})
            self.assertEqual(calls[2][2], {'action': 'goto', 'revision': 7, 'step': 2})
            self.assertEqual(calls[3][2], {'action': 'find', 'query': 'soup', 'open': True})
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_redirect_never_receives_credential(self):
        calls = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args): pass
            def do_POST(self):
                calls.append(self.path)
                self.rfile.read(int(self.headers['Content-Length']))
                self.send_response(302 if self.path == '/api/voice' else 200)
                self.send_header('Location', '/leak'); self.end_headers()
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with patch.object(plugin, '_settings', return_value=(f'http://127.0.0.1:{server.server_port}', 'TEST_KEY')):
                self.assertIn('error', plugin._request({'action': 'current'}))
            self.assertEqual(calls, ['/api/voice'])
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_conflicts_are_not_retried(self):
        with patch.object(plugin, '_request', side_effect=[{'revision': 5, 'recipe': {}}, {'status': 409, 'error': 'Session changed'}]) as request:
            result = json.loads(plugin._control({'action': 'next'}))
            self.assertEqual(result['status'], 409)
            self.assertEqual(request.call_count, 2)

    def test_step_command_is_distinguished_from_a_peek_question(self):
        with patch.object(plugin, '_request', return_value={'revision': 12, 'selected': None, 'recipe': None}):
            command = plugin._turn_context(platform='api_server', user_message='Current time: 12:00\nNext step in this recipe.')['context']
            question = plugin._turn_context(platform='api_server', user_message='What comes next in this recipe?')['context']
            self.assertIn('REQUIRED ACTION', command)
            self.assertIn('"action": "next"', command)
            self.assertNotIn('REQUIRED ACTION', question)

    def test_live_turn_context_overrides_old_chat_without_injecting_recipe_instructions(self):
        self.assertTrue(hasattr(plugin, '_turn_context'), 'live turn context is missing')
        with patch.object(plugin, '_request', return_value={'revision': 12, 'selected': 'a', 'recipe': {'id': 'new', 'title': 'Chili', 'steps': [{'id': 'a', 'text': 'PRIVATE RECIPE BODY'}]}}):
            context = plugin._turn_context(platform='api_server')['context']
            self.assertIn('Chili', context)
            self.assertIn('12', context)
            self.assertNotIn('PRIVATE RECIPE BODY', context)
        with patch.object(plugin, '_request') as request:
            self.assertIsNone(plugin._turn_context(platform='cli'))
            request.assert_not_called()

if __name__ == '__main__': unittest.main()
