<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";

	let { data, form } = $props();
	const forgotTokenValue = $derived.by(() => {
		if(data.token) return data.token;
		if (!form || typeof form !== "object" || !("values" in form) || !form.values) return "";
		const values = form.values as { forgotToken?: string };
		return values.forgotToken ?? "";
	});
</script>

<Card.Root>
	<Card.Header class="text-center">
		<Card.Title class="text-xl">Reset Password</Card.Title>
		<Card.Description>Enter your reset token and new password.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST">
			<Field.Group>
				<Field.Field>
					<Field.Label for="forgot_token">Reset Token</Field.Label>
					<Input
						id="forgot_token"
						name="forgot_token"
						type="text"
						required
						value={forgotTokenValue}
						readonly={data.token !== null}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="password">New Password</Field.Label>
					<Input id="password" name="password" type="password" required />
				</Field.Field>
				<Field.Field>
					<Field.Label for="confirm_password">Confirm Password</Field.Label>
					<Input id="confirm_password" name="confirm_password" type="password" required />
				</Field.Field>
				{#if form?.error}
					<Field.Description class="text-destructive text-center">{form.error}</Field.Description>
				{/if}
				<Field.Field>
					<Button type="submit">Reset Password</Button>
					<Field.Description class="text-center">
						Back to <a href="/auth/signin">Sign in</a>
					</Field.Description>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
