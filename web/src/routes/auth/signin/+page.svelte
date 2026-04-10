<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription,
		FieldSeparator,
	} from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";

	let { form } = $props();
</script>

<Card.Root>
	<Card.Header class="text-center">
		<Card.Title class="text-xl">Hesperida</Card.Title>
		<Card.Description>Web App Scanner</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST">
			<FieldGroup>
				<FieldSeparator class="*:data-[slot=field-separator-content]:bg-card">
					Sign In
				</FieldSeparator>
				<Field>
					<FieldLabel for="email-signin">Email</FieldLabel>
					<Input
						id="email-signin"
						name="email"
						type="email"
						placeholder="m@example.com"
						required
						value={form?.values?.email ?? ""}
					/>
				</Field>
				<Field>
					<div class="flex items-center">
						<FieldLabel for="password-signin">Password</FieldLabel>
						<a href="/auth/forgot" class="ms-auto text-sm underline-offset-4 hover:underline">
							Forgot your password?
						</a>
					</div>
					<Input id="password-signin" name="password" type="password" required />
				</Field>
				{#if form?.error}
					<FieldDescription class="text-destructive text-center">{form.error}</FieldDescription>
				{/if}
				<Field>
					<Button type="submit">Login</Button>
					<FieldDescription class="text-center">
						Don't have an account? <a href="/auth/signup">Sign up</a>
					</FieldDescription>
				</Field>
			</FieldGroup>
		</form>
	</Card.Content>
</Card.Root>

