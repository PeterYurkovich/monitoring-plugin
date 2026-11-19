package k8s

import (
	"errors"
	"fmt"
	"sync"
	"testing"
)

func TestPortForwardTunnelReusesAndReopens(t *testing.T) {
	var tunnel portForwardTunnel
	var callbacks []func(error)
	open := func(onEnd func(error)) (string, error) {
		callbacks = append(callbacks, onEnd)
		return fmt.Sprintf("127.0.0.1:%d", len(callbacks)), nil
	}

	for range 2 {
		addr, err := tunnel.address("test-service", open)
		if err != nil || addr != "127.0.0.1:1" {
			t.Fatalf("address = %q, error = %v", addr, err)
		}
	}
	if len(callbacks) != 1 {
		t.Fatalf("opened %d tunnels, want 1", len(callbacks))
	}

	callbacks[0](nil)
	addr, err := tunnel.address("test-service", open)
	if err != nil || addr != "127.0.0.1:2" {
		t.Fatalf("reopened address = %q, error = %v", addr, err)
	}

	// An old forward completing again cannot invalidate its replacement.
	callbacks[0](nil)
	addr, err = tunnel.address("test-service", open)
	if err != nil || addr != "127.0.0.1:2" || len(callbacks) != 2 {
		t.Fatalf("stale completion changed the tunnel: address %q, error %v, opens %d", addr, err, len(callbacks))
	}
}

func TestPortForwardTunnelRetriesFailedOpen(t *testing.T) {
	var tunnel portForwardTunnel
	var failedOnEnd func(error)
	openErr := errors.New("cannot open forward")
	addr, err := tunnel.address("test-service", func(onEnd func(error)) (string, error) {
		failedOnEnd = onEnd
		return "", openErr
	})
	if !errors.Is(err, openErr) || addr != "" {
		t.Fatalf("failed address = %q, error = %v", addr, err)
	}

	addr, err = tunnel.address("test-service", func(func(error)) (string, error) {
		return "127.0.0.1:1234", nil
	})
	if err != nil || addr != "127.0.0.1:1234" {
		t.Fatalf("retry address = %q, error = %v", addr, err)
	}

	// A failed attempt may finish after a successful retry has started.
	failedOnEnd(nil)
	addr, err = tunnel.address("test-service", func(func(error)) (string, error) {
		t.Fatal("completion from a failed open invalidated the retry")
		return "", nil
	})
	if err != nil || addr != "127.0.0.1:1234" {
		t.Fatalf("cached retry address = %q, error = %v", addr, err)
	}
}

func TestPortForwardTunnelConcurrentAccess(t *testing.T) {
	var tunnel portForwardTunnel
	var callers sync.WaitGroup
	opens := 0
	open := func(func(error)) (string, error) {
		opens++
		return "127.0.0.1:1234", nil
	}
	for range 10 {
		callers.Go(func() {
			addr, err := tunnel.address("test-service", open)
			if err != nil || addr != "127.0.0.1:1234" {
				t.Errorf("address = %q, error = %v", addr, err)
			}
		})
	}
	callers.Wait()
	if opens != 1 {
		t.Fatalf("opened %d tunnels concurrently, want 1", opens)
	}
}
