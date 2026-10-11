/* global document, axe */
import './host-component.mjs';
import { settled } from '@gyral/core';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createApp, nextTick } from 'vue';
import { mount, unmount, tick } from 'svelte';
import SvelteHost from './Host.svelte';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export async function runHosts() {
  const results = {};
  const container = () => {
    const root = document.createElement('main');
    document.body.append(root);
    return root;
  };
  const inspect = async (root, seen) => {
    await settled();
    const picker = root.querySelector('platform-picker');
    assert(picker?.items?.[0] === 'a', 'array was not assigned as a property');
    assert(picker.label === 'Choose', 'label prop');
    picker.shadowRoot.querySelector('button').click();
    await settled();
    assert(seen.length === 1 && seen[0].id === 'a', 'gyral-output detail');
    const accessibility = await axe.run(root);
    assert(accessibility.violations.length === 0, 'axe violations');
    assert(
      accessibility.passes.some(
        (rule) =>
          rule.id === 'button-name' &&
          rule.nodes.some(
            (node) =>
              node.html.startsWith('<button') &&
              node.target.flat().some((target) => target.includes('platform-picker')),
          ),
      ),
      'axe did not scan the button inside the shadow root',
    );
    return picker;
  };

  const reactContainer = container();
  const reactRoot = createRoot(reactContainer);
  const reactSeen = [];
  flushSync(() =>
    reactRoot.render(
      createElement('platform-picker', {
        label: 'Choose',
        items: ['a'],
        'ongyral-output': (event) => reactSeen.push(event.detail),
      }),
    ),
  );
  await inspect(reactContainer, reactSeen);
  flushSync(() =>
    reactRoot.render(
      createElement('platform-picker', {
        label: 'Changed',
        items: ['b'],
      }),
    ),
  );
  await settled();
  assert(reactContainer.querySelector('platform-picker').items[0] === 'b', 'React prop update');
  reactRoot.unmount();
  reactContainer.remove();
  results.react = true;

  const vueContainer = container();
  const vueSeen = [];
  const vue = createApp({
    data: () => ({ items: ['a'] }),
    methods: {
      picked(event) {
        vueSeen.push(event.detail);
      },
    },
    template: '<platform-picker label="Choose" :items.prop="items" @gyral-output="picked" />',
  });
  vue.config.compilerOptions.isCustomElement = (tag) => tag === 'platform-picker';
  const instance = vue.mount(vueContainer);
  await nextTick();
  const vuePicker = await inspect(vueContainer, vueSeen);
  instance.items = ['b'];
  await nextTick();
  await settled();
  assert(vuePicker.items[0] === 'b', 'Vue prop update');
  vue.unmount();
  vueContainer.remove();
  results.vue = true;

  const svelteContainer = container();
  const svelteSeen = [];
  const svelte = mount(SvelteHost, {
    target: svelteContainer,
    props: {
      onPick: (event) => svelteSeen.push(event.detail),
    },
  });
  await tick();
  await inspect(svelteContainer, svelteSeen);
  svelteContainer.querySelector('button').click();
  await tick();
  await settled();
  assert(svelteContainer.querySelector('platform-picker').items[0] === 'b', 'Svelte prop update');
  await unmount(svelte);
  svelteContainer.remove();
  results.svelte = true;
  results.accessibility = true;
  return results;
}
