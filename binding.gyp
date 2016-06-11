{
  "targets": [
    {
      "target_name": "addon",
      "sources": [ "addon.cc",
                   "client.cc",
                   "connect-worker.cc" ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")",
        "<!(pg_config --includedir)",
			],
      'conditions': [
        ['OS=="linux"', {
          'libraries' : ['-lpq -L<!(pg_config --libdir)']
        } ],
        ['OS=="mac"', {
          'libraries' : ['-lpq -L<!(pg_config --libdir)']
        } ],
        ['OS=="win"', { }]
      ]
    }
  ],
}
