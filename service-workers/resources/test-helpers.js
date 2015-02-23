// Adapter for testharness.js-style tests with Service Workers

function service_worker_unregister_and_register(test, url, scope) {
  if (!scope || scope.length == 0)
    return Promise.reject(new Error('tests must define a scope'));

  var options = { scope: scope };
  return service_worker_unregister(test, scope)
    .then(function() {
        return navigator.serviceWorker.register(url, options);
      })
    .catch(unreached_rejection(test,
                               'unregister and register should not fail'));
}

function service_worker_unregister(test, documentUrl) {
  return navigator.serviceWorker.getRegistration(documentUrl)
    .then(function(registration) {
        if (registration)
          return registration.unregister();
      })
    .catch(unreached_rejection(test, 'unregister should not fail'));
}

function service_worker_unregister_and_done(test, scope) {
  return service_worker_unregister(test, scope)
    .then(test.done.bind(test));
}

// Rejection-specific helper that provides more details
function unreached_rejection(test, prefix) {
  return test.step_func(function(error) {
      var reason = error.message || error.name || error;
      var error_prefix = prefix || 'unexpected rejection';
      assert_unreached(error_prefix + ': ' + reason);
    });
}

// FIXME: Clean up the iframe when the test completes.
function with_iframe(url, f) {
  return new Promise(function(resolve, reject) {
      var frame = document.createElement('iframe');
      frame.src = url;
      frame.onload = function() {
        if (f) {
          f(frame);
        }
        resolve(frame);
      };
      document.body.appendChild(frame);
    });
}

function unload_iframe(iframe) {
  var saw_unload = new Promise(function(resolve) {
      iframe.contentWindow.addEventListener('unload', function() {
          resolve();
        });
    });
  iframe.src = '';
  iframe.remove();
  return saw_unload;
}

function normalizeURL(url) {
  return new URL(url, document.location).toString().replace(/#.*$/, '');
}

function wait_for_update(test, registration) {
  if (!registration || registration.unregister == undefined) {
    return Promise.reject(new Error(
      'wait_for_update must be passed a ServiceWorkerRegistration'));
  }

  return new Promise(test.step_func(function(resolve) {
      registration.addEventListener('updatefound', test.step_func(function() {
          resolve(registration.installing);
        }));
    }));
}

function wait_for_state(test, worker, state) {
  if (!worker || worker.state == undefined) {
    return Promise.reject(new Error(
      'wait_for_state must be passed a ServiceWorker'));
  }
  if (worker.state === state)
    return Promise.resolve(state);

  if (state === 'installing') {
    switch (worker.state) {
      case 'installed':
      case 'activating':
      case 'activated':
      case 'redundant':
        return Promise.reject(new Error(
          'worker is ' + worker.state + ' but waiting for ' + state));
    }
  }

  if (state === 'installed') {
    switch (worker.state) {
      case 'activating':
      case 'activated':
      case 'redundant':
        return Promise.reject(new Error(
          'worker is ' + worker.state + ' but waiting for ' + state));
    }
  }

  if (state === 'activating') {
    switch (worker.state) {
      case 'activated':
      case 'redundant':
        return Promise.reject(new Error(
          'worker is ' + worker.state + ' but waiting for ' + state));
    }
  }

  if (state === 'activated') {
    switch (worker.state) {
      case 'redundant':
        return Promise.reject(new Error(
          'worker is ' + worker.state + ' but waiting for ' + state));
    }
  }

  return new Promise(test.step_func(function(resolve) {
      worker.addEventListener('statechange', test.step_func(function() {
          if (worker.state === state)
            resolve(state);
        }));
    }));
}

// Declare a test that runs entirely in the ServiceWorkerGlobalScope. The |url|
// is the service worker script URL. This function:
// - Instantiates a new test with the description specified in |description|.
//   The test will succeed if the specified service worker can be successfully
//   registered and installed.
// - Creates a new ServiceWorker registration with a scope unique to the current
//   document URL. Note that this doesn't allow more than one
//   service_worker_test() to be run from the same document.
// - Waits for the new worker to begin installing.
// - Imports tests results from tests running inside the ServiceWorker.
function service_worker_test(url, description) {
  // If the document URL is https://example.com/document and the script URL is
  // https://example.com/script/worker.js, then the scope would be
  // https://example.com/script/scope/document.
  var scope = new URL('scope' + window.location.pathname,
                      new URL(url, window.location)).toString();
  promise_test(function(test) {
      return service_worker_unregister_and_register(test, url, scope)
        .then(function(registration) {
            add_completion_callback(function() {
                registration.unregister();
              });
            return wait_for_update(test, registration)
              .then(function(worker) {
                  return fetch_tests_from_worker(worker);
                });
          });
    }, description);
}

function get_host_info() {
  var ORIGINAL_HOST = '127.0.0.1';
  var REMOTE_HOST = 'localhost';
  var UNAUTHENTICATED_HOST = 'example.test';
  var HTTP_PORT = 8000;
  var HTTPS_PORT = 8443;
  try {
    // In W3C test, we can get the hostname and port number in config.json
    // using wptserve's built-in pipe.
    // http://wptserve.readthedocs.org/en/latest/pipes.html#built-in-pipes
    HTTP_PORT = eval('{{ports[http][0]}}');
    HTTPS_PORT = eval('{{ports[https][0]}}');
    ORIGINAL_HOST = eval('\'{{host}}\'');
    REMOTE_HOST = 'www1.' + ORIGINAL_HOST;
  } catch (e) {
  }
  return {
    HTTP_ORIGIN: 'http://' + ORIGINAL_HOST + ':' + HTTP_PORT,
    HTTPS_ORIGIN: 'https://' + ORIGINAL_HOST + ':' + HTTPS_PORT,
    HTTP_REMOTE_ORIGIN: 'http://' + REMOTE_HOST + ':' + HTTP_PORT,
    HTTPS_REMOTE_ORIGIN: 'https://' + REMOTE_HOST + ':' + HTTPS_PORT,
    UNAUTHENTICATED_ORIGIN: 'http://' + UNAUTHENTICATED_HOST + ':' + HTTP_PORT
  };
}

function base_path() {
  return location.pathname.replace(/\/[^\/]*$/, '/');
}

function test_login(test, origin, username, password, cookie) {
  return new Promise(function(resolve, reject) {
      with_iframe(
        origin + base_path() +
        'resources/fetch-access-control-login.html')
        .then(test.step_func(function(frame) {
            var channel = new MessageChannel();
            channel.port1.onmessage = test.step_func(function() {
                unload_iframe(frame).catch(function() {});
                resolve();
              });
            frame.contentWindow.postMessage(
              {username: username, password: password, cookie: cookie},
              [channel.port2], origin);
          }));
    });
}

/*
 * testharness-helpers contains various useful extensions to testharness.js to
 * allow them to be used across multiple tests before they have been
 * upstreamed. This file is intended to be usable from both document and worker
 * environments, so code should for example not rely on the DOM.
 */
// Returns a promise that fulfills after the provided |promise| is fulfilled.
// The |test| succeeds only if |promise| rejects with an exception matching
// |code|. Accepted values for |code| follow those accepted for assert_throws().
// The optional |description| describes the test being performed.
//
// E.g.:
//   assert_promise_rejects(
//       new Promise(...), // something that should throw an exception.
//       'NotFoundError',
//       'Should throw NotFoundError.');
//
//   assert_promise_rejects(
//       new Promise(...),
//       new TypeError(),
//       'Should throw TypeError');
function assert_promise_rejects(promise, code, description) {
  return promise.then(
    function() {
      throw 'assert_promise_rejects: ' + description + ' Promise did not reject.';
    },
    function(e) {
      if (code !== undefined) {
        assert_throws(code, function() { throw e; }, description);
      }
    });
}
// Asserts that two objects |actual| and |expected| are weakly equal under the
// following definition:
//
// |a| and |b| are weakly equal if any of the following are true:
//   1. If |a| is not an 'object', and |a| === |b|.
//   2. If |a| is an 'object', and all of the following are true:
//     2.1 |a.p| is weakly equal to |b.p| for all own properties |p| of |a|.
//     2.2 Every own property of |b| is an own property of |a|.
//
// This is a replacement for the the version of assert_object_equals() in
// testharness.js. The latter doesn't handle own properties correctly. I.e. if
// |a.p| is not an own property, it still requires that |b.p| be an own
// property.
//
// Note that |actual| must not contain cyclic references.
self.assert_object_equals = function(actual, expected, description) {
  var object_stack = [];
  function _is_equal(actual, expected, prefix) {
    if (typeof actual !== 'object') {
      assert_equals(actual, expected, prefix);
      return;
    }
    assert_true(typeof expected === 'object', prefix);
    assert_equals(object_stack.indexOf(actual), -1,
                  prefix + ' must not contain cyclic references.');
    object_stack.push(actual);
    Object.getOwnPropertyNames(expected).forEach(function(property) {
        assert_own_property(actual, property, prefix);
        _is_equal(actual[property], expected[property],
                  prefix + '.' + property);
      });
    Object.getOwnPropertyNames(actual).forEach(function(property) {
        assert_own_property(expected, property, prefix);
      });
    object_stack.pop();
  }
  function _brand(object) {
    return Object.prototype.toString.call(object).match(/^\[object (.*)\]$/)[1];
  }
  _is_equal(actual, expected,
            (description ? description + ': ' : '') + _brand(expected));
};
// Equivalent to assert_in_array, but uses a weaker equivalence relation
// (assert_object_equals) than '==='.
function assert_object_in_array(actual, expected_array, description) {
  assert_true(expected_array.some(function(element) {
      try {
        assert_object_equals(actual, element);
        return true;
      } catch (e) {
        return false;
      }
    }), description);
}
// Assert that the two arrays |actual| and |expected| contain the same set of
// elements as determined by assert_object_equals. The order is not significant.
//
// |expected| is assumed to not contain any duplicates as determined by
// assert_object_equals().
function assert_array_equivalent(actual, expected, description) {
  assert_true(Array.isArray(actual), description);
  assert_equals(actual.length, expected.length, description);
  expected.forEach(function(expected_element) {
      // assert_in_array treats the first argument as being 'actual', and the
      // second as being 'expected array'. We are switching them around because
      // we want to be resilient against the |actual| array containing
      // duplicates.
      assert_object_in_array(expected_element, actual, description);
    });
}
// Asserts that two arrays |actual| and |expected| contain the same set of
// elements as determined by assert_object_equals(). The corresponding elements
// must occupy corresponding indices in their respective arrays.
function assert_array_objects_equals(actual, expected, description) {
  assert_true(Array.isArray(actual), description);
  assert_equals(actual.length, expected.length, description);
  actual.forEach(function(value, index) {
      assert_object_equals(value, expected[index],
                           description + ' : object[' + index + ']');
    });
}
// Asserts that |object| that is an instance of some interface has the attribute
// |attribute_name| following the conditions specified by WebIDL, but it's
// acceptable that the attribute |attribute_name| is an own property of the
// object because we're in the middle of moving the attribute to a prototype
// chain.  Once we complete the transition to prototype chains,
// assert_will_be_idl_attribute must be replaced with assert_idl_attribute
// defined in testharness.js.
//
// FIXME: Remove assert_will_be_idl_attribute once we complete the transition
// of moving the DOM attributes to prototype chains.  (http://crbug.com/43394)
function assert_will_be_idl_attribute(object, attribute_name, description) {
  assert_true(typeof object === "object", description);
  assert_true("hasOwnProperty" in object, description);
  // Do not test if |attribute_name| is not an own property because
  // |attribute_name| is in the middle of the transition to a prototype
  // chain.  (http://crbug.com/43394)
  assert_true(attribute_name in object, description);
}
// Stringifies a DOM object.  This function stringifies not only own properties
// but also DOM attributes which are on a prototype chain.  Note that
// JSON.stringify only stringifies own properties.
function stringifyDOMObject(object)
{
    function deepCopy(src) {
        if (typeof src != "object")
            return src;
        var dst = Array.isArray(src) ? [] : {};
        for (var property in src) {
            dst[property] = deepCopy(src[property]);
        }
        return dst;
    }
    return JSON.stringify(deepCopy(object));
}
