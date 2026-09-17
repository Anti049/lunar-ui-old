export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		// Pin scopes to the package names so they stay greppable.
		'scope-enum': [2, 'always', ['core', 'svelte', 'react', 'vue', 'docs', 'repo', 'deps']],
		'scope-empty': [1, 'never'],
		'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
		'subject-full-stop': [2, 'never', '.'],
		'header-max-length': [2, 'always', 72],
		'body-max-line-length': [2, 'always', 100],
		'body-leading-blank': [2, 'always'],
		'footer-leading-blank': [2, 'always']
	}
};
