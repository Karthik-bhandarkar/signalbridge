"use client";

import { ArrowUpRight } from "lucide-react";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions";
import { Button, ErrorState, Field } from "@/components/ui/controls";

const initial: LoginState = {};

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="ops-login-fields" noValidate={false}>
      <Field id="operator-email" label="Email address">
        <input
          id="operator-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue="ops@signalbridge.dev"
          className="ui-input"
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </Field>
      <Field id="operator-password" label="Passphrase">
        <input
          id="operator-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          defaultValue="oncall"
          className="ui-input"
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </Field>
      {state.error && (
        <div id="login-error">
          <ErrorState title="Sign-in failed" description={state.error} />
        </div>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={pending}
        trailingIcon={!pending ? <ArrowUpRight size={15} aria-hidden="true" /> : undefined}
        className="ops-login-submit"
      >
        {pending ? "Opening your workspace…" : "Enter the console"}
      </Button>
    </form>
  );
}
