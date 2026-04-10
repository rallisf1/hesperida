<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";

	let { form } = $props();
</script>

<Card.Root>
	<Card.Header class="text-center">
		<Card.Title class="text-xl">Forgot Password</Card.Title>
		<Card.Description>Enter your account email to generate a reset token.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST">
			<Field.Group>
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
				{#if form?.error}
					<Field.Description class="text-destructive text-center">{form.error}</Field.Description>
				{/if}
				{#if form?.success}
					<Field.Description class="text-center">{form.success}</Field.Description>
				{/if}
				<Field.Field>
					<Button type="submit">Send Reset Link</Button>
					<Field.Description class="text-center">
						Remembered your password? <a href="/auth/signin">Sign in</a>
					</Field.Description>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
