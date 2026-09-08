<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Hash, Eye, Code } from '@lucide/svelte';
	import * as prettier from 'prettier/standalone';
	import * as htmlPlugin from 'prettier/plugins/html';
	import CodeBlock from '../components/CodeBlock.svelte';
	import { cn } from '$lib/utils';

	interface ComponentPreviewProps {
		title: string;
		id: string;
		description?: string;
		view?: 'component' | 'code';
		code?: string;
		editable?: boolean;
		class?: string;
		children: Snippet<[]>;
	}
	let {
		title,
		id,
		description,
		view = $bindable('component'),
		code = $bindable(''),
		editable = false,
		class: className = '',
		children
	}: ComponentPreviewProps = $props();
	let previewBody: HTMLDivElement | undefined = $state();

	// Placeholder emitted in place of a Lucide <svg>, swapped for a component tag post-format.
	const LUCIDE_TOKEN = /%%LUCIDE:([A-Za-z0-9]+)%%/g;

	function lucideComponentName(el: Element): string | null {
		const cls = Array.from(el.classList).find(
			(c) => c.startsWith('lucide-') && c !== 'lucide-icon'
		);
		if (!cls) return null;
		return cls
			.slice('lucide-'.length)
			.replace(/(^|-)([a-z0-9])/g, (_, __, ch: string) => ch.toUpperCase());
	}

	function stripBlankComments(root: Element): void {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
		const blanks: Comment[] = [];
		while (walker.nextNode()) {
			const node = walker.currentNode as Comment;
			if (!node.data.trim()) blanks.push(node);
		}
		blanks.forEach((node) => node.remove());
	}

	function getCodeOfChildren(): string {
		if (!previewBody) return '';
		return Array.from(previewBody.children)
			.map((child) => {
				const clone = child.cloneNode(true) as Element;
				const rootName = clone instanceof SVGElement ? lucideComponentName(clone) : null;
				if (rootName) return `%%LUCIDE:${rootName}%%`;
				stripBlankComments(clone);
				clone.querySelectorAll('svg').forEach((svg) => {
					const name = lucideComponentName(svg);
					if (name) svg.replaceWith(`%%LUCIDE:${name}%%`);
				});
				return clone.outerHTML;
			})
			.join('\n');
	}

	async function formatCode(raw: string): Promise<string> {
		if (!raw.trim()) return '';
		let output = raw;
		try {
			output = await prettier.format(raw, {
				parser: 'html',
				plugins: [htmlPlugin],
				useTabs: true,
				printWidth: 100,
				htmlWhitespaceSensitivity: 'ignore'
			});
		} catch {
			// Fall back to the unformatted markup.
		}
		return output.replace(LUCIDE_TOKEN, '<$1 />').trim();
	}

	onMount(async () => {
		code = await formatCode(getCodeOfChildren());
	});
</script>

<div {id} class={cn('component-preview', className)}>
	<div class="appbar border-b border-on-surface-variant/15">
		<div class="appbar-leading">
			<a href={'#' + id} class="button button-square button-md button-text button-info">
				<Hash />
			</a>
		</div>
		<div class="appbar-body">
			<p class="appbar-title">{title}</p>
			{#if description}
				<p class="appbar-subtitle">{description}</p>
			{/if}
		</div>
		<div class="appbar-trailing">
			<div class="tooltip tooltip-end" data-tooltip="Show component">
				<button
					class={cn(
						'button button-square button-md button-surface',
						view === 'component' ? 'button-tonal' : 'button-text'
					)}
					aria-label="Show component"
					onclick={() => (view = 'component')}
				>
					<Eye />
				</button>
			</div>
			<div class="tooltip tooltip-end" data-tooltip="Show code">
				<button
					class={cn(
						'button button-square button-md button-surface',
						view === 'code' ? 'button-tonal' : 'button-text'
					)}
					aria-label="Show code"
					onclick={() => (view = 'code')}
				>
					<Code />
				</button>
			</div>
		</div>
	</div>
	<div
		bind:this={previewBody}
		class={cn('component-preview-body component-preview-body-pattern', view === 'code' && 'hidden')}
	>
		{@render children()}
	</div>
	<div class={cn('component-preview-body', view === 'code' ? '' : 'hidden')}>
		<CodeBlock bind:code {editable} lang="svelte" />
	</div>
</div>
