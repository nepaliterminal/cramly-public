import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mountAuth } from '../docs/auth.js';

const config = { apiKey: 'api-key', authDomain: 'cramly.example', projectId: 'project', appId: 'app-id' };
const user = { uid: 'user-id', displayName: 'Taylor Chen', photoURL: 'https://example.com/avatar' };
const workspace = ['study-skip-link', 'study-header', 'main', 'print-content'];

function harness() {
  const nodes = new Map();
  const calls = [];
  let observe;
  const $ = (id) => {
    if (!nodes.has(id)) {
      const handlers = {};
      nodes.set(id, {
        hidden: workspace.includes(id), disabled: id === 'sign-in',
        addEventListener: (name, handler) => { handlers[name] = handler; },
        fire: (name) => handlers[name](),
        focus: () => calls.push('focus'),
      });
    }
    return nodes.get(id);
  };
  const document = {
    getElementById: $,
    querySelectorAll: () => [{ close: () => calls.push('close-dialog') }],
    defaultView: { location: { reload: () => calls.push('reload') } },
  };
  const auth = {};
  const sdk = {
    initializeApp: (options) => { assert.deepEqual(options, config); },
    getAuth: () => auth,
    GoogleAuthProvider: class {},
    getRedirectResult: async (instance) => { assert.equal(instance, auth); calls.push('redirect-result'); },
    onAuthStateChanged: (instance, callback) => { assert.equal(instance, auth); observe = callback; },
    signInWithPopup: async (instance, provider) => {
      assert.equal(instance, auth);
      assert.ok(provider instanceof sdk.GoogleAuthProvider);
      calls.push('popup');
    },
    signInWithRedirect: async (instance, provider) => {
      assert.equal(instance, auth);
      assert.ok(provider instanceof sdk.GoogleAuthProvider);
      calls.push('redirect');
    },
    signOut: async (instance) => { assert.equal(instance, auth); calls.push('sign-out'); },
  };
  return {
    $, calls, sdk, emit: (user) => observe(user),
    mount: (options) => mountAuth(document, {
      config, loadSdk: async () => sdk, loadWorkspace: async () => { calls.push('workspace'); }, ...options,
    }),
  };
}

test('the HTML gates the study workspace before JavaScript or Firebase loads', async () => {
  const page = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
  for (const id of workspace) assert.match(page, new RegExp(`id="${id}"[^>]*\\bhidden\\b`));
  assert.match(page, /id="sign-in"[^>]*disabled/);
  assert.doesNotMatch(page, /<script[^>]*src="\.\/app\.js"/);
});

test('placeholder config keeps the app locked without loading the SDK', async () => {
  const { $, mount } = harness();
  await mount({ config: { ...config, apiKey: 'YOUR_API_KEY' }, loadSdk: () => assert.fail('loaded Firebase') });
  assert.equal($('sign-in').disabled, true);
  assert.match($('sign-in-status').textContent, /not set up/);
  assert.ok(workspace.every((id) => $(id).hidden));
});

test('opens the app and shows the Google profile only after the auth observer returns a user', async () => {
  const { $, calls, emit, mount } = harness();
  await mount();
  await emit(null);
  assert.equal($('sign-in').disabled, false);
  await $('sign-in').fire('click');
  assert.ok(workspace.every((id) => $(id).hidden));
  assert.deepEqual(calls, ['redirect-result', 'popup']);
  await emit(user);
  assert.ok(workspace.every((id) => !$(id).hidden));
  assert.equal($('sign-in-screen').hidden, true);
  assert.equal($('account-name').textContent, 'Taylor Chen');
  assert.equal($('account-avatar').src, user.photoURL);
  $('account-avatar').fire('error');
  assert.equal($('account-avatar').hidden, true);
  assert.equal($('account-initials').textContent, 'T');
  assert.equal($('account-initials').hidden, false);

  await $('sign-out').fire('click');
  await emit(null);
  assert.ok(workspace.every((id) => $(id).hidden));
  assert.equal($('sign-in-screen').hidden, false);
  assert.deepEqual(calls.slice(2), ['workspace', 'focus', 'sign-out', 'close-dialog', 'reload']);
});

test('redirects when popups are blocked and handles the returning session', async () => {
  const { $, calls, emit, mount, sdk } = harness();
  sdk.signInWithPopup = async () => { throw { code: 'auth/popup-blocked' }; };
  await mount();
  await emit(null);
  await $('sign-in').fire('click');
  assert.deepEqual(calls, ['redirect-result', 'redirect']);
  assert.equal($('sign-in').disabled, true);

  const returning = harness();
  await returning.mount();
  await returning.emit(user);
  assert.deepEqual(returning.calls, ['redirect-result', 'workspace']);
  assert.equal(returning.$('main').hidden, false);
});

test('a cancelled popup does not redirect and the user can retry after an auth error', async () => {
  const { $, calls, emit, mount, sdk } = harness();
  sdk.getRedirectResult = async () => { throw new Error('redirect failed'); };
  sdk.signInWithPopup = async () => { throw { code: 'auth/popup-closed-by-user' }; };
  await mount();
  await emit(null);
  assert.match($('sign-in-status').textContent, /Could not finish/);
  await $('sign-in').fire('click');
  assert.equal($('sign-in').disabled, false);
  assert.match($('sign-in-status').textContent, /window was closed/);
  assert.deepEqual(calls, []);
  assert.ok(workspace.every((id) => $(id).hidden));
});
