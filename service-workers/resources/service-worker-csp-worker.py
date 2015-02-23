def main(request, response):

    headers = [('Content-Type', 'application/javascript')]
    directive = request.GET['directive']

    filename = "service-worker-scp-worker-%s.js" % directive
    with open(filename) as f:
        body = f.read()

    if directive == 'default':
        headers.append(('Content-Security-Policy', 'default-src \'self\''))

    elif directive == 'script':
        headers.append(('Content-Security-Policy', 'script-src \'self\''))

    elif directive == 'connect':
        headers.append(('Content-Security-Policy', 'connect-src \'self\''))

    return headers, body
