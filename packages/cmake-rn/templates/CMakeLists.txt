cmake_minimum_required(VERSION 3.15...3.31)
project({{name}})

{{nodeApi}}
set_target_properties({{name}} PROPERTIES PREFIX "" SUFFIX .node)
