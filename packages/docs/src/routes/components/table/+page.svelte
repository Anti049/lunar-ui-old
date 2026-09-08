<script lang="ts">
	import ComponentPreview from '$lib/demo/ComponentPreview.svelte';
	import ComponentClassTable from '$lib/demo/ComponentClassTable.svelte';
</script>

<div class="flex h-full w-full flex-col gap-4">
	<!-- Header/Classes -->
	<ComponentClassTable name="table" />

	<!-- Basic -->
	<ComponentPreview id="table" title="Table" description="A basic table with a header and body.">
		<div class="w-full overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Role</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Luna Vega</td>
						<td>Designer</td>
						<td>Active</td>
					</tr>
					<tr>
						<td>Aria Cole</td>
						<td>Engineer</td>
						<td>Active</td>
					</tr>
					<tr>
						<td>Milo Chan</td>
						<td>Manager</td>
						<td>Away</td>
					</tr>
				</tbody>
			</table>
		</div>
	</ComponentPreview>

	<!-- Zebra -->
	<ComponentPreview
		id="table-zebra"
		title="Zebra"
		description="Stripe alternating rows with table-zebra."
	>
		<div class="w-full overflow-x-auto">
			<table class="table table-zebra">
				<thead>
					<tr>
						<th>Name</th>
						<th>Role</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Luna Vega</td>
						<td>Designer</td>
						<td>Active</td>
					</tr>
					<tr>
						<td>Aria Cole</td>
						<td>Engineer</td>
						<td>Active</td>
					</tr>
					<tr>
						<td>Milo Chan</td>
						<td>Manager</td>
						<td>Away</td>
					</tr>
				</tbody>
			</table>
		</div>
	</ComponentPreview>

	<!-- Sizes -->
	<ComponentPreview
		id="table-sizes"
		title="Sizes"
		description="Scale padding and text from table-xs to table-xl."
	>
		<div class="flex w-full flex-col gap-4">
			<div class="flex flex-col gap-1">
				<p class="text-label-large text-on-surface-variant">table-xs</p>
				<table class="table table-xs">
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Luna Vega</td>
							<td>Designer</td>
						</tr>
						<tr>
							<td>Aria Cole</td>
							<td>Engineer</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex flex-col gap-1">
				<p class="text-label-large text-on-surface-variant">table-sm</p>
				<table class="table table-sm">
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Luna Vega</td>
							<td>Designer</td>
						</tr>
						<tr>
							<td>Aria Cole</td>
							<td>Engineer</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex flex-col gap-1">
				<p class="text-label-large text-on-surface-variant">table-md</p>
				<table class="table table-md">
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Luna Vega</td>
							<td>Designer</td>
						</tr>
						<tr>
							<td>Aria Cole</td>
							<td>Engineer</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex flex-col gap-1">
				<p class="text-label-large text-on-surface-variant">table-lg</p>
				<table class="table table-lg">
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Luna Vega</td>
							<td>Designer</td>
						</tr>
						<tr>
							<td>Aria Cole</td>
							<td>Engineer</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex flex-col gap-1">
				<p class="text-label-large text-on-surface-variant">table-xl</p>
				<table class="table table-xl">
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Luna Vega</td>
							<td>Designer</td>
						</tr>
						<tr>
							<td>Aria Cole</td>
							<td>Engineer</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</ComponentPreview>

	<!-- Pin Rows -->
	<ComponentPreview
		id="table-pin-rows"
		title="Pin Rows"
		description="Keep the header visible while the body scrolls vertically."
	>
		<div class="max-h-52 w-full overflow-y-auto rounded-sm">
			<table class="table-pin-rows table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Role</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Luna Vega</td>
						<td>Designer</td>
						<td>Active</td>
					</tr>
					<tr>
						<td>Aria Cole</td>
						<td>Engineer</td>
						<td>Active</td>
					</tr>
					<tr>
						<td>Milo Chan</td>
						<td>Manager</td>
						<td>Away</td>
					</tr>
					<tr>
						<td>Noa Reyes</td>
						<td>Analyst</td>
						<td>Active</td>
					</tr>
					<tr>
						<td>Ezra Kim</td>
						<td>Designer</td>
						<td>Offline</td>
					</tr>
					<tr>
						<td>Ivy Sato</td>
						<td>Engineer</td>
						<td>Active</td>
					</tr>
					<tr>
						<td>Omar Diaz</td>
						<td>Manager</td>
						<td>Away</td>
					</tr>
					<tr>
						<td>Zoe Park</td>
						<td>Analyst</td>
						<td>Active</td>
					</tr>
				</tbody>
			</table>
		</div>
	</ComponentPreview>

	<!-- Pin Columns -->
	<ComponentPreview
		id="table-pin-cols"
		title="Pin Columns"
		description="Keep th cells pinned while columns scroll horizontally."
	>
		<div class="w-full max-w-full overflow-x-auto">
			<table class="table-pin-cols table">
				<thead>
					<tr>
						<th>Name</th>
						<td>Role</td>
						<td>Location</td>
						<td>Department</td>
						<td>Status</td>
						<td>Joined</td>
					</tr>
				</thead>
				<tbody>
					<tr>
						<th>Luna Vega</th>
						<td>Designer</td>
						<td>Lisbon</td>
						<td>Product</td>
						<td>Active</td>
						<td>2021</td>
					</tr>
					<tr>
						<th>Aria Cole</th>
						<td>Engineer</td>
						<td>Berlin</td>
						<td>Platform</td>
						<td>Active</td>
						<td>2019</td>
					</tr>
					<tr>
						<th>Milo Chan</th>
						<td>Manager</td>
						<td>Toronto</td>
						<td>Operations</td>
						<td>Away</td>
						<td>2018</td>
					</tr>
				</tbody>
			</table>
		</div>
	</ComponentPreview>
</div>
