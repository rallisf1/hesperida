<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";

	let { form } = $props();
</script>

<Card.Root>
	<Card.Header class="text-center">
		<Card.Title class="text-xl">Hesperida</Card.Title>
		<Card.Description>Enter your email and a password to create your account</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST">
			<Field.Group>
				<Field.Field>
					<Field.Label for="name">Full Name</Field.Label>
					<Input
						id="name"
						name="name"
						type="text"
						placeholder="John Doe"
						required
						value={form?.values?.name ?? ""}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="email">Email</Field.Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="m@example.com"
						required
						value={form?.values?.email ?? ""}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Field class="grid grid-cols-2 gap-4">
						<Field.Field>
							<Field.Label for="password">Password</Field.Label>
							<Input id="password" name="password" type="password" required />
						</Field.Field>
						<Field.Field>
							<Field.Label for="confirm-password">Confirm Password</Field.Label>
							<Input id="confirm-password" name="confirm_password" type="password" required />
						</Field.Field>
					</Field.Field>
					<Field.Description>Must be at least 8 characters long.</Field.Description>
				</Field.Field>
				{#if form?.error}
					<Field.Description class="text-destructive text-center">{form.error}</Field.Description>
				{/if}
				<Field.Field>
					<Button type="submit">Create Account</Button>
					<Field.Description class="text-center">
						Already have an account? <a href="/auth/signin">Sign in</a>
					</Field.Description>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
