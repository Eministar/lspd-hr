import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesSearch, hasMissingUnitGroup } from '../src/lib/admin-search'

test('user search handles case, accents, multiple terms and Discord IDs', () => {
 assert.equal(matchesSearch('muller HR', ['Müller', 'Human Resources', 'HR']), true)
 assert.equal(matchesSearch('  123456789012345678  ', ['Anna', '123456789012345678']), true)
 assert.equal(matchesSearch('anna academy', ['Anna', 'Academy']), true)
 assert.equal(matchesSearch('anna academy', ['Anna', 'HR']), false)
 assert.equal(matchesSearch('  ', [null, undefined]), true)
})
test('orphaned and inactive units remain accounted for independently of groups', () => {
 const groups=[{id:'existing'}]
 const units=[{id:'a',groupId:'deleted',active:true},{id:'b',groupId:'existing',active:true},{id:'c',groupId:null,active:false}]
 assert.equal(hasMissingUnitGroup(units[0],groups),true)
 assert.equal(hasMissingUnitGroup(units[1],groups),false)
 assert.equal(hasMissingUnitGroup(units[2],groups),false)
 const visible=units.filter(u=>!u.groupId || hasMissingUnitGroup(u,groups))
 assert.deepEqual(visible.map(u=>u.id),['a','c'])
 assert.equal(visible.length+units.filter(u=>groups.some(g=>g.id===u.groupId)).length,units.length)
 assert.equal(units[0].groupId,'deleted') // Rendering must never change assignments.
})
