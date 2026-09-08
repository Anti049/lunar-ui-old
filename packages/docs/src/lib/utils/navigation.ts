import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

/**
 * Components
 *
 * 3D Viewer
 * Accordion
 * Appbar
 * Aura
 * Avatar
 * Badge
 * Breadcrumb
 * Button
 * Calendar
 * Card
 * Carousel
 * Chart
 * Chat
 * Checkbox
 * Code Block
 * Collapsible
 * Combobox
 * Command
 * Context Menu
 * Countdown
 * Data Table
 * Date Picker
 * Dialog
 * Diff
 * Divider
 * Drawer
 * Dropdown
 * FAB
 * File Upload
 * Form
 * Helper
 * Hover 3D
 * Hover Card
 * Hover Gallery
 * Indicator
 * Input
 * Input OTP
 * Join
 * Kbd
 * Label
 * Loading
 * Marquee
 * Mask
 * Menu
 * Mockup
 * Modal
 * Navigation
 * Pagination
 * Panel
 * Placeholder
 * Popover
 * Portal
 * Progress
 * QR Code
 * Radio
 * Rating
 * Resizable
 * Scroll Area
 * Section
 * Select
 * Sidebar
 * Skeleton
 * Slider
 * Spinner
 * Status
 * Steps
 * Swap
 * Switch
 * Table
 * Tabs
 * Tag
 * Text Reel
 * Timeline
 * Titlebar
 * Toast
 * Toggle
 * Tooltip
 * Tree
 * Tristate
 */
type NavigationRoute = {
	label: string;
	href: ResolvedPathname;
	icon?: string;
	disabled?: boolean;
	status: 'planned' | 'up-next' | 'in-progress' | 'completed' | 'deprecated';
};

const plannedHref = (path: string): ResolvedPathname => path as ResolvedPathname;

const componentStyles = import.meta.glob<string>('/src/lib/styles/components/*.css', {
	eager: true,
	query: '?raw',
	import: 'default'
});

function isDisabled(route: NavigationRoute): boolean {
	// Check if a CSS file exists for the component, if not, mark it as disabled
	const cssFilePath = `/src/lib/styles/components/${route.href.replace('/components/', '')}.css`;
	const cssContent = componentStyles[cssFilePath];
	const meaningfulCss = cssContent?.replace(/\/\*[\s\S]*?\*\//g, '').trim();
	return !meaningfulCss || route.disabled === true;
}

const componentLinks: NavigationRoute[] = [
	{
		label: '3D Viewer',
		href: resolve('/components/3d-viewer'),
		icon: '/icons/navigation/box.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/accordion'),
		label: 'Accordion',
		icon: '/icons/navigation/list-chevrons-up-down.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/appbar'),
		label: 'Appbar',
		icon: '/icons/navigation/panel-top.svg',
		status: 'completed'
	},
	{
		href: resolve('/components/aura'),
		label: 'Aura',
		icon: '/icons/navigation/flame.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/avatar'),
		label: 'Avatar',
		icon: '/icons/navigation/user.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/badge'),
		label: 'Badge',
		icon: '/icons/navigation/circle-star.svg',
		status: 'in-progress'
	},
	{
		href: resolve('/components/breadcrumb'),
		label: 'Breadcrumb',
		icon: '/icons/navigation/route.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/button'),
		label: 'Button',
		icon: '/icons/navigation/square-plus.svg',
		status: 'completed'
	},
	{
		href: resolve('/components/calendar'),
		label: 'Calendar',
		icon: '/icons/navigation/calendar-days.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/card'),
		label: 'Card',
		icon: '/icons/navigation/id-card.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/carousel'),
		label: 'Carousel',
		icon: '/icons/navigation/gallery-horizontal-end.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/chart'),
		label: 'Chart',
		icon: '/icons/navigation/chart-column.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/chat'),
		label: 'Chat',
		icon: '/icons/navigation/messages-square.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/checkbox'),
		label: 'Checkbox',
		icon: '/icons/navigation/square-check.svg',
		status: 'completed'
	},
	{
		href: resolve('/components/code-block'),
		label: 'Code Block',
		icon: '/icons/navigation/code.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/collapsible'),
		label: 'Collapsible',
		icon: '/icons/navigation/fold-vertical.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/combobox'),
		label: 'Combobox',
		icon: '/icons/navigation/combine.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/command'),
		label: 'Command',
		icon: '/icons/navigation/terminal.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/context-menu'),
		label: 'Context Menu',
		icon: '/icons/navigation/mouse-right.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/countdown'),
		label: 'Countdown',
		icon: '/icons/navigation/clock-fading.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/data-table'),
		label: 'Data Table',
		icon: '/icons/navigation/columns-3-cog.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/date-picker'),
		label: 'Date Picker',
		icon: '/icons/navigation/calendar-plus.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/dialog'),
		label: 'Dialog',
		icon: '/icons/navigation/picture-in-picture.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/diff'),
		label: 'Diff',
		icon: '/icons/navigation/columns-2.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/divider'),
		label: 'Divider',
		icon: '/icons/navigation/square-split-vertical.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/drawer'),
		label: 'Drawer',
		icon: '/icons/navigation/panel-left-close.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/dropdown'),
		label: 'Dropdown',
		icon: '/icons/navigation/chevron-down.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/fab'),
		label: 'FAB',
		icon: '/icons/navigation/circle-plus.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/file-upload'),
		label: 'File Upload',
		icon: '/icons/navigation/file-plus-corner.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/form'),
		label: 'Form',
		icon: '/icons/navigation/form.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/helper'),
		label: 'Helper',
		icon: '/icons/navigation/circle-question-mark.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/hover-3d'),
		label: 'Hover 3D',
		icon: '/icons/navigation/rotate-3d.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/hover-card'),
		label: 'Hover Card',
		icon: '/icons/navigation/card-sim.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/hover-gallery'),
		label: 'Hover Gallery',
		icon: '/icons/navigation/scan-eye.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/indicator'),
		label: 'Indicator',
		icon: '/icons/navigation/rss.svg',
		status: 'in-progress'
	},
	{
		href: resolve('/components/input'),
		label: 'Input',
		icon: '/icons/navigation/text-cursor-input.svg',
		status: 'up-next'
	},
	{
		href: plannedHref('/components/input-otp'),
		label: 'Input OTP',
		icon: '/icons/navigation/rectangle-ellipsis.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/join'),
		label: 'Join',
		icon: '/icons/navigation/columns-3.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/kbd'),
		label: 'Kbd',
		icon: '/icons/navigation/keyboard.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/label'),
		label: 'Label',
		icon: '/icons/navigation/bookmark.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/loading'),
		label: 'Loading',
		icon: '/icons/navigation/loader.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/marquee'),
		label: 'Marquee',
		icon: '/icons/navigation/gallery-horizontal.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/mask'),
		label: 'Mask',
		icon: '/icons/navigation/eye-off.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/menu'),
		label: 'Menu',
		icon: '/icons/navigation/menu.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/mockup'),
		label: 'Mockup',
		icon: '/icons/navigation/drama.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/modal'),
		label: 'Modal',
		icon: '/icons/navigation/inspection-panel.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/navigation'),
		label: 'Navigation',
		icon: '/icons/navigation/map-pin.svg',
		status: 'in-progress'
	},
	{
		href: resolve('/components/pagination'),
		label: 'Pagination',
		icon: '/icons/navigation/gallery-thumbnails.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/panel'),
		label: 'Panel',
		icon: '/icons/navigation/panel-left-dashed.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/placeholder'),
		label: 'Placeholder',
		icon: '/icons/navigation/circle-ellipsis.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/popover'),
		label: 'Popover',
		icon: '/icons/navigation/balloon.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/portal'),
		label: 'Portal',
		icon: '/icons/navigation/replace.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/progress'),
		label: 'Progress',
		icon: '/icons/navigation/loader-circle.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/qr-code'),
		label: 'QR Code',
		icon: '/icons/navigation/qr-code.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/radio'),
		label: 'Radio',
		icon: '/icons/navigation/circle-dot.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/rating'),
		label: 'Rating',
		icon: '/icons/navigation/star.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/resizable'),
		label: 'Resizable',
		icon: '/icons/navigation/scaling.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/scroll-area'),
		label: 'Scroll Area',
		icon: '/icons/navigation/mouse.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/scaffold'),
		label: 'Scaffold',
		icon: '/icons/navigation/panels-top-left.svg',
		status: 'in-progress'
	},
	{
		href: resolve('/components/scrollbar'),
		label: 'Scrollbar',
		icon: '/icons/navigation/panel-right.svg',
		status: 'up-next'
	},
	{
		href: resolve('/components/section'),
		label: 'Section',
		icon: '/icons/navigation/panel-top-open.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/select'),
		label: 'Select',
		icon: '/icons/navigation/between-horizontal-end.svg',
		status: 'in-progress'
	},
	{
		href: resolve('/components/sidebar'),
		label: 'Sidebar',
		icon: '/icons/navigation/panel-left.svg',
		status: 'in-progress'
	},
	{
		href: plannedHref('/components/skeleton'),
		label: 'Skeleton',
		icon: '/icons/navigation/square-dashed.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/slider'),
		label: 'Slider',
		icon: '/icons/navigation/sliders-horizontal.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/spinner'),
		label: 'Spinner',
		icon: '/icons/navigation/circle-dot-dashed.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/status'),
		label: 'Status',
		icon: '/icons/navigation/globe-check.svg',
		status: 'deprecated'
	},
	{
		href: resolve('/components/steps'),
		label: 'Steps',
		icon: '/icons/navigation/waypoints.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/swap'),
		label: 'Swap',
		icon: '/icons/navigation/arrow-left-right.svg',
		status: 'completed'
	},
	{
		href: resolve('/components/switch'),
		label: 'Switch',
		icon: '/icons/navigation/toggle-right.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/table'),
		label: 'Table',
		icon: '/icons/navigation/sheet.svg',
		status: 'completed'
	},
	{
		href: resolve('/components/tabs'),
		label: 'Tabs',
		icon: '/icons/navigation/notebook-tabs.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/tag'),
		label: 'Tag',
		icon: '/icons/navigation/tag.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/text-reel'),
		label: 'Text Reel',
		icon: '/icons/navigation/a-arrow-down.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/timeline'),
		label: 'Timeline',
		icon: '/icons/navigation/timeline.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/titlebar'),
		label: 'Titlebar',
		icon: '/icons/navigation/app-window.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/toast'),
		label: 'Toast',
		icon: '/icons/navigation/bell.svg',
		status: 'planned'
	},
	{
		href: plannedHref('/components/toggle'),
		label: 'Toggle',
		icon: '/icons/navigation/circle-power.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/tooltip'),
		label: 'Tooltip',
		icon: '/icons/navigation/info.svg',
		status: 'completed'
	},
	{
		href: resolve('/components/tree'),
		label: 'Tree',
		icon: '/icons/navigation/list-tree.svg',
		status: 'planned'
	},
	{
		href: resolve('/components/tristate'),
		label: 'Tristate',
		icon: '/icons/navigation/square-minus.svg',
		status: 'planned'
	}
];

export { componentLinks, isDisabled, type NavigationRoute };
