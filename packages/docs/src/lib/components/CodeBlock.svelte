<script lang="ts">
	/* eslint-disable svelte/no-at-html-tags */
	import { basicSetup } from 'codemirror';
	import { EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	import { codeToHtml, type ThemeRegistrationResolved } from 'shiki';
	import { onMount } from 'svelte';

	interface CodeBlockProps {
		code?: string;
		lang?: string;
		theme?: string;
		editable?: boolean;
	}
	let { code = $bindable(''), lang = 'svelte', theme, editable = false }: CodeBlockProps = $props();
	let highlighted = $state('');
	let editorElement = $state<HTMLDivElement>();
	let editorView: EditorView | undefined;
	const codeTheme: ThemeRegistrationResolved = {
		name: 'dark-theme',
		type: 'dark',
		fg: 'var(--color-on-surface)',
		bg: 'var(--color-surface-container-lowest)',
		settings: [
			{
				scope: ['text', 'source', 'variable.other.readwrite', 'punctuation.definition.variable'],
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'punctuation',
				settings: {
					fontStyle: '',
					foreground: 'var(--color-on-surface-variant)'
				}
			},
			{
				scope: ['comment', 'punctuation.definition.comment'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-on-surface-variant)'
				}
			},
			{
				scope: ['string', 'punctuation.definition.string'],
				settings: {
					foreground: 'var(--color-success)'
				}
			},
			{
				scope: 'constant.character.escape',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: [
					'constant.numeric',
					'variable.other.constant',
					'entity.name.constant',
					'constant.language.boolean',
					'constant.language.false',
					'constant.language.true',
					'keyword.other.unit.user-defined',
					'keyword.other.unit.suffix.floating-point'
				],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'keyword',
					'keyword.operator.word',
					'keyword.operator.new',
					'variable.language.super',
					'support.type.primitive',
					'storage.type',
					'storage.modifier',
					'punctuation.definition.keyword'
				],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'entity.name.tag.documentation',
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: [
					'keyword.operator',
					'punctuation.accessor',
					'punctuation.definition.generic',
					'meta.function.closure punctuation.section.parameters',
					'punctuation.definition.tag',
					'punctuation.separator.key-value'
				],
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: [
					'entity.name.function',
					'meta.function-call.method',
					'support.function',
					'support.function.misc',
					'variable.function'
				],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: [
					'entity.name.class',
					'entity.other.inherited-class',
					'support.class',
					'meta.function-call.constructor',
					'entity.name.struct'
				],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-alert)'
				}
			},
			{
				scope: 'entity.name.enum',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['meta.enum variable.other.readwrite', 'variable.other.enummember'],
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: 'meta.property.object',
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: ['meta.type', 'meta.type-alias', 'support.type', 'entity.name.type'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'meta.annotation variable.function',
					'meta.annotation variable.annotation.function',
					'meta.annotation punctuation.definition.annotation',
					'meta.decorator',
					'punctuation.decorator'
				],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['variable.parameter', 'meta.function.parameters'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: ['constant.language', 'support.function.builtin'],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'entity.other.attribute-name.documentation',
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: ['keyword.control.directive', 'punctuation.definition.directive'],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'punctuation.definition.typeparameters',
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: 'entity.name.namespace',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['support.type.property-name.css', 'support.type.property-name.less'],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: ['variable.language.this', 'variable.language.this punctuation.definition.variable'],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'variable.object.property',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: ['string.template variable', 'string variable'],
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'keyword.operator.new',
				settings: {
					fontStyle: 'bold'
				}
			},
			{
				scope: 'storage.modifier.specifier.extern.cpp',
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: [
					'entity.name.scope-resolution.template.call.cpp',
					'entity.name.scope-resolution.parameter.cpp',
					'entity.name.scope-resolution.cpp',
					'entity.name.scope-resolution.function.definition.cpp'
				],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'storage.type.class.doxygen',
				settings: {
					fontStyle: ''
				}
			},
			{
				scope: ['storage.modifier.reference.cpp'],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'meta.interpolation.cs',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'comment.block.documentation.cs',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: [
					'source.css entity.other.attribute-name.class.css',
					'entity.other.attribute-name.parent-selector.css punctuation.definition.entity.css'
				],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'punctuation.separator.operator.css',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'source.css entity.other.attribute-name.pseudo-class',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'source.css constant.other.unicode-range',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'source.css variable.parameter.url',
				settings: {
					fontStyle: '',
					foreground: 'var(--color-success)'
				}
			},
			{
				scope: ['support.type.vendored.property-name'],
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: [
					'source.css meta.property-value variable',
					'source.css meta.property-value variable.other.less',
					'source.css meta.property-value variable.other.less punctuation.definition.variable.less',
					'meta.definition.variable.scss'
				],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: [
					'source.css meta.property-list variable',
					'meta.property-list variable.other.less',
					'meta.property-list variable.other.less punctuation.definition.variable.less'
				],
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: 'keyword.other.unit.percentage.css',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'source.css meta.attribute-selector',
				settings: {
					foreground: 'var(--color-success)'
				}
			},
			{
				scope: [
					'keyword.other.definition.ini',
					'punctuation.support.type.property-name.json',
					'support.type.property-name.json',
					'punctuation.support.type.property-name.toml',
					'support.type.property-name.toml',
					'entity.name.tag.yaml',
					'punctuation.support.type.property-name.yaml',
					'support.type.property-name.yaml'
				],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: ['constant.language.json', 'constant.language.yaml'],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['entity.name.type.anchor.yaml', 'variable.other.alias.yaml'],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['support.type.property-name.table', 'entity.name.section.group-title.ini'],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'constant.other.time.datetime.offset.toml',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: ['punctuation.definition.anchor.yaml', 'punctuation.definition.alias.yaml'],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'entity.other.document.begin.yaml',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'markup.changed.diff',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'meta.diff.header.from-file',
					'meta.diff.header.to-file',
					'punctuation.definition.from-file.diff',
					'punctuation.definition.to-file.diff'
				],
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: 'markup.inserted.diff',
				settings: {
					foreground: 'var(--color-success)'
				}
			},
			{
				scope: 'markup.deleted.diff',
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: ['variable.other.env'],
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: ['string.quoted variable.other.env'],
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'support.function.builtin.gdscript',
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: 'constant.language.gdscript',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'comment meta.annotation.go',
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'comment meta.annotation.parameters.go',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'constant.language.go',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'variable.graphql',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'string.unquoted.alias.graphql',
				settings: {
					foreground: 'var(--color-alert)'
				}
			},
			{
				scope: 'constant.character.enum.graphql',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'meta.objectvalues.graphql constant.object.key.graphql string.unquoted.graphql',
				settings: {
					foreground: 'var(--color-alert)'
				}
			},
			{
				scope: [
					'meta.declaration.data constant.other.haskell',
					'constant.other.haskell',
					'meta.declaration.pattern constant.other.haskell',
					'constant.language.unit.haskell punctuation',
					'constant.language.unit.unboxed.haskell punctuation'
				],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: ['storage.type.haskell'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'support.constant.unit.haskell punctuation',
					'support.constant.unit.haskell keyword.operator.hash',
					'support.constant.unit.unboxed.haskell punctuation',
					'support.constant.unit.unboxed.haskell keyword.operator.hash'
				],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['variable.other.generic-type.haskell'],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: [
					'keyword.other.default.haskell',
					'keyword.other.role.nominal.haskell',
					'keyword.other.role.representational.haskell',
					'keyword.other.role.phantom.haskell'
				],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: ['keyword.other.preprocessor.haskell', 'keyword.other.preprocessor.pragma.haskell'],
				settings: {
					foreground: 'var(--color-alert)'
				}
			},
			{
				scope: ['keyword.other.preprocessor.extension.haskell'],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: [
					'source.haskell meta.preprocessor.c',
					'source.haskell meta.preprocessor.c punctuation.definition.preprocessor.c'
				],
				settings: {
					foreground: 'var(--color-alert)'
				}
			},
			{
				scope: ['meta.preprocessor.haskell'],
				settings: {
					foreground: 'var(--color-on-surface-variant)'
				}
			},
			{
				scope: ['variable.other.member.haskell', 'variable.other.member.definition.haskell'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: ['keyword.control.else.haskell'],
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: [
					'string.quoted.single.haskell',
					'string.quoted.single.haskell punctuation.definition.string'
				],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: [
					'storage.type.operator.haskell',
					'storage.type.operator.infix.haskell',
					'entity.name.function.infix.haskell',
					'punctuation.backtick.haskell'
				],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: ['support.constant.tuple.haskell', 'support.constant.tuple.unboxed.haskell'],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: [
					'keyword.operator.lambda.haskell',
					'keyword.operator.pipe.haskell',
					'keyword.operator.double-dot.haskell',
					'variable.other.member.wildcard.haskell'
				],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: [
					'meta.type-application keyword.operator.prefix.at.haskell',
					'keyword.operator.infix.tight.at.haskell',
					'keyword.operator.prefix.tilde.haskell',
					'keyword.operator.prefix.bang.haskell',
					'keyword.operator.double-colon.haskell',
					'keyword.operator.big-arrow.haskell',
					'meta.function.type-declaration keyword.operator.period.haskell',
					'meta.type-declaration keyword.operator.period.haskell',
					'meta.declaration.type keyword.operator.period.haskell'
				],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-on-surface-variant)'
				}
			},
			{
				scope: [
					'keyword.operator.prefix.dollar.haskell',
					'keyword.operator.quasi-quotation.begin.haskell',
					'keyword.operator.quasi-quotation.end.haskell'
				],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: ['keyword.operator.prefix.minus.haskell'],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'keyword.other.doctype',
					'meta.tag.sgml.doctype punctuation.definition.tag',
					'meta.tag.metadata.doctype entity.name.tag',
					'meta.tag.metadata.doctype punctuation.definition.tag'
				],
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: ['entity.name.tag'],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: [
					'text.html constant.character.entity',
					'text.html constant.character.entity punctuation',
					'constant.character.entity.xml',
					'constant.character.entity.xml punctuation',
					'constant.character.entity.js.jsx',
					'constant.charactger.entity.js.jsx punctuation',
					'constant.character.entity.tsx',
					'constant.character.entity.tsx punctuation'
				],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: ['entity.other.attribute-name'],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'support.class.component',
					'support.class.component.jsx',
					'support.class.component.tsx',
					'support.class.component.vue'
				],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: ['punctuation.definition.annotation', 'storage.type.annotation'],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'constant.other.enum.java',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'storage.modifier.import.java',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'comment.block.javadoc.java keyword.other.documentation.javadoc.java',
				settings: {
					fontStyle: ''
				}
			},
			{
				scope: 'meta.export variable.other.readwrite.js',
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: [
					'variable.other.constant.js',
					'variable.other.constant.ts',
					'variable.other.property.js',
					'variable.other.property.ts'
				],
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: ['variable.other.jsdoc', 'comment.block.documentation variable.other'],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'storage.type.class.jsdoc',
				settings: {
					fontStyle: ''
				}
			},
			{
				scope: 'support.type.object.console.js',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: ['support.constant.node', 'support.type.object.module.js'],
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'storage.modifier.implements',
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: [
					'constant.language.null.js',
					'constant.language.null.ts',
					'constant.language.undefined.js',
					'constant.language.undefined.ts',
					'support.type.builtin.ts'
				],
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'variable.parameter.generic',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['keyword.declaration.function.arrow.js', 'storage.type.function.arrow.ts'],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'punctuation.decorator.ts',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: [
					'keyword.operator.expression.in.js',
					'keyword.operator.expression.in.ts',
					'keyword.operator.expression.infer.ts',
					'keyword.operator.expression.instanceof.js',
					'keyword.operator.expression.instanceof.ts',
					'keyword.operator.expression.is',
					'keyword.operator.expression.keyof.ts',
					'keyword.operator.expression.of.js',
					'keyword.operator.expression.of.ts',
					'keyword.operator.expression.typeof.ts'
				],
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'support.function.macro.julia',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'constant.language.julia',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'constant.other.symbol.julia',
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'text.tex keyword.control.preamble',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'text.tex support.function.be',
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: 'constant.other.general.math.tex',
				settings: {
					foreground: 'var(--color-alert)'
				}
			},
			{
				scope: 'variable.language.liquid',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'comment.line.double-dash.documentation.lua storage.type.annotation.lua',
				settings: {
					fontStyle: '',
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: [
					'comment.line.double-dash.documentation.lua entity.name.variable.lua',
					'comment.line.double-dash.documentation.lua variable.lua'
				],
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: [
					'heading.1.markdown punctuation.definition.heading.markdown',
					'heading.1.markdown',
					'heading.1.quarto punctuation.definition.heading.quarto',
					'heading.1.quarto',
					'markup.heading.atx.1.mdx',
					'markup.heading.atx.1.mdx punctuation.definition.heading.mdx',
					'markup.heading.setext.1.markdown',
					'markup.heading.heading-0.asciidoc'
				],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: [
					'heading.2.markdown punctuation.definition.heading.markdown',
					'heading.2.markdown',
					'heading.2.quarto punctuation.definition.heading.quarto',
					'heading.2.quarto',
					'markup.heading.atx.2.mdx',
					'markup.heading.atx.2.mdx punctuation.definition.heading.mdx',
					'markup.heading.setext.2.markdown',
					'markup.heading.heading-1.asciidoc'
				],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'heading.3.markdown punctuation.definition.heading.markdown',
					'heading.3.markdown',
					'heading.3.quarto punctuation.definition.heading.quarto',
					'heading.3.quarto',
					'markup.heading.atx.3.mdx',
					'markup.heading.atx.3.mdx punctuation.definition.heading.mdx',
					'markup.heading.heading-2.asciidoc'
				],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'heading.4.markdown punctuation.definition.heading.markdown',
					'heading.4.markdown',
					'heading.4.quarto punctuation.definition.heading.quarto',
					'heading.4.quarto',
					'markup.heading.atx.4.mdx',
					'markup.heading.atx.4.mdx punctuation.definition.heading.mdx',
					'markup.heading.heading-3.asciidoc'
				],
				settings: {
					foreground: 'var(--color-success)'
				}
			},
			{
				scope: [
					'heading.5.markdown punctuation.definition.heading.markdown',
					'heading.5.markdown',
					'heading.5.quarto punctuation.definition.heading.quarto',
					'heading.5.quarto',
					'markup.heading.atx.5.mdx',
					'markup.heading.atx.5.mdx punctuation.definition.heading.mdx',
					'markup.heading.heading-4.asciidoc'
				],
				settings: {
					foreground: '#74c7ec'
				}
			},
			{
				scope: [
					'heading.6.markdown punctuation.definition.heading.markdown',
					'heading.6.markdown',
					'heading.6.quarto punctuation.definition.heading.quarto',
					'heading.6.quarto',
					'markup.heading.atx.6.mdx',
					'markup.heading.atx.6.mdx punctuation.definition.heading.mdx',
					'markup.heading.heading-5.asciidoc'
				],
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: 'markup.bold',
				settings: {
					fontStyle: 'bold',
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'markup.italic',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'markup.strikethrough',
				settings: {
					fontStyle: 'strikethrough',
					foreground: '#a6adc8'
				}
			},
			{
				scope: ['punctuation.definition.link', 'markup.underline.link'],
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: [
					'text.html.markdown punctuation.definition.link.title',
					'text.html.quarto punctuation.definition.link.title',
					'string.other.link.title.markdown',
					'string.other.link.title.quarto',
					'markup.link',
					'punctuation.definition.constant.markdown',
					'punctuation.definition.constant.quarto',
					'constant.other.reference.link.markdown',
					'constant.other.reference.link.quarto',
					'markup.substitution.attribute-reference'
				],
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: [
					'punctuation.definition.raw.markdown',
					'punctuation.definition.raw.quarto',
					'markup.inline.raw.string.markdown',
					'markup.inline.raw.string.quarto',
					'markup.raw.block.markdown',
					'markup.raw.block.quarto'
				],
				settings: {
					foreground: 'var(--color-success)'
				}
			},
			{
				scope: 'fenced_code.block.language',
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: ['markup.fenced_code.block punctuation.definition', 'markup.raw support.asciidoc'],
				settings: {
					foreground: 'var(--color-on-surface-variant)'
				}
			},
			{
				scope: ['markup.quote', 'punctuation.definition.quote.begin'],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'meta.separator.markdown',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: [
					'punctuation.definition.list.begin.markdown',
					'punctuation.definition.list.begin.quarto',
					'markup.list.bullet'
				],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'markup.heading.quarto',
				settings: {
					fontStyle: 'bold'
				}
			},
			{
				scope: [
					'entity.other.attribute-name.multipart.nix',
					'entity.other.attribute-name.single.nix'
				],
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: 'variable.parameter.name.nix',
				settings: {
					fontStyle: '',
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'meta.embedded variable.parameter.name.nix',
				settings: {
					fontStyle: '',
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: 'string.unquoted.path.nix',
				settings: {
					fontStyle: '',
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: ['support.attribute.builtin', 'meta.attribute.php'],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'meta.function.parameters.php punctuation.definition.variable.php',
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'constant.language.php',
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'text.html.php support.function',
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: 'keyword.other.phpdoc.php',
				settings: {
					fontStyle: ''
				}
			},
			{
				scope: ['support.variable.magic.python', 'meta.function-call.arguments.python'],
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: ['support.function.magic.python'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: [
					'variable.parameter.function.language.special.self.python',
					'variable.language.special.self.python'
				],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: ['keyword.control.flow.python', 'keyword.operator.logical.python'],
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'storage.type.function.python',
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: ['support.token.decorator.python', 'meta.function.decorator.identifier.python'],
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: ['meta.function-call.python'],
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: ['entity.name.function.decorator.python', 'punctuation.definition.decorator.python'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'constant.character.format.placeholder.other.python',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: ['support.type.exception.python', 'support.function.builtin.python'],
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['support.type.python'],
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'constant.language.python',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['meta.indexed-name.python', 'meta.item-access.python'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'storage.type.string.python',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-success)'
				}
			},
			{
				scope: 'meta.function.parameters.python',
				settings: {
					fontStyle: ''
				}
			},
			{
				scope: 'meta.function-call.r',
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: 'meta.function-call.arguments.r',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: [
					'string.regexp punctuation.definition.string.begin',
					'string.regexp punctuation.definition.string.end'
				],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'keyword.control.anchor.regexp',
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'string.regexp.ts',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: ['punctuation.definition.group.regexp', 'keyword.other.back-reference.regexp'],
				settings: {
					foreground: 'var(--color-success)'
				}
			},
			{
				scope: 'punctuation.definition.character-class.regexp',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'constant.other.character-class.regexp',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'constant.other.character-class.range.regexp',
				settings: {
					foreground: 'var(--color-alert)'
				}
			},
			{
				scope: 'keyword.operator.quantifier.regexp',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'constant.character.numeric.regexp',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'punctuation.definition.group.no-capture.regexp',
					'meta.assertion.look-ahead.regexp',
					'meta.assertion.negative-look-ahead.regexp'
				],
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: [
					'meta.annotation.rust',
					'meta.annotation.rust punctuation',
					'meta.attribute.rust',
					'punctuation.definition.attribute.rust'
				],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'meta.attribute.rust string.quoted.double.rust',
					'meta.attribute.rust string.quoted.single.char.rust'
				],
				settings: {
					fontStyle: ''
				}
			},
			{
				scope: [
					'entity.name.function.macro.rules.rust',
					'storage.type.module.rust',
					'storage.modifier.rust',
					'storage.type.struct.rust',
					'storage.type.enum.rust',
					'storage.type.trait.rust',
					'storage.type.union.rust',
					'storage.type.impl.rust',
					'storage.type.rust',
					'storage.type.function.rust',
					'storage.type.type.rust'
				],
				settings: {
					fontStyle: '',
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'entity.name.type.numeric.rust',
				settings: {
					fontStyle: '',
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'meta.generic.rust',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'entity.name.impl.rust',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'entity.name.module.rust',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'entity.name.trait.rust',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'storage.type.source.rust',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'entity.name.union.rust',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: 'meta.enum.rust storage.type.source.rust',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: [
					'support.macro.rust',
					'meta.macro.rust support.function.rust',
					'entity.name.function.macro.rust'
				],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: ['storage.modifier.lifetime.rust', 'entity.name.type.lifetime'],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: 'string.quoted.double.rust constant.other.placeholder.rust',
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'meta.function.return-type.rust meta.generic.rust storage.type.rust',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'meta.function.call.rust',
				settings: {
					foreground: 'var(--color-info)'
				}
			},
			{
				scope: 'punctuation.brackets.angle.rust',
				settings: {
					foreground: 'var(--color-secondary)'
				}
			},
			{
				scope: 'constant.other.caps.rust',
				settings: {
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: ['meta.function.definition.rust variable.other.rust'],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'meta.function.call.rust variable.other.rust',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: 'variable.language.self.rust',
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: [
					'variable.other.metavariable.name.rust',
					'meta.macro.metavariable.rust keyword.operator.macro.dollar.rust'
				],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: [
					'comment.line.shebang',
					'comment.line.shebang punctuation.definition.comment',
					'comment.line.shebang',
					'punctuation.definition.comment.shebang.shell',
					'meta.shebang.shell'
				],
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'comment.line.shebang constant.language',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: [
					'meta.function-call.arguments.shell punctuation.definition.variable.shell',
					'meta.function-call.arguments.shell punctuation.section.interpolation',
					'meta.function-call.arguments.shell punctuation.definition.variable.shell',
					'meta.function-call.arguments.shell punctuation.section.interpolation'
				],
				settings: {
					foreground: 'var(--color-error)'
				}
			},
			{
				scope: 'meta.string meta.interpolation.parameter.shell variable.other.readwrite',
				settings: {
					fontStyle: 'italic',
					foreground: 'var(--color-warning)'
				}
			},
			{
				scope: [
					'source.shell punctuation.section.interpolation',
					'punctuation.definition.evaluation.backticks.shell'
				],
				settings: {
					foreground: 'var(--color-tertiary)'
				}
			},
			{
				scope: 'entity.name.tag.heredoc.shell',
				settings: {
					foreground: 'var(--color-primary)'
				}
			},
			{
				scope: 'string.quoted.double.shell variable.other.normal.shell',
				settings: {
					foreground: 'var(--color-on-surface)'
				}
			},
			{
				scope: ['markup.heading.typst'],
				settings: {
					foreground: 'var(--color-error)'
				}
			}
		]
	};

	async function highlightCode() {
		if (editable) return;
		highlighted = await codeToHtml(code.trim(), {
			lang,
			theme: theme ?? codeTheme
		});
	}
	onMount(() => {
		if (editable && editorElement) {
			editorView = new EditorView({
				state: EditorState.create({
					doc: code,
					extensions: [
						basicSetup,
						EditorView.lineWrapping,
						EditorView.updateListener.of((update) => {
							if (update.docChanged) code = update.state.doc.toString();
						})
					]
				}),
				parent: editorElement
			});
		}
		highlightCode();
		return () => editorView?.destroy();
	});
	$effect(() => {
		highlightCode();
	});
</script>

<div class="code-block">
	{#if editable}
		<div bind:this={editorElement} class="code-block-editor" aria-label="Editable code"></div>
	{:else}
		{@html highlighted}
	{/if}
</div>
